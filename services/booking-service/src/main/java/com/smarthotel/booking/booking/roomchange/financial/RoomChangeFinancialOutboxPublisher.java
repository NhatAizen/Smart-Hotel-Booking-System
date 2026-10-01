package com.smarthotel.booking.booking.roomchange.financial;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.concurrent.TimeUnit;

@Component
@ConditionalOnProperty(
        name = "features.room-change-customer-wallet-credit-enabled",
        havingValue = "true"
)
public class RoomChangeFinancialOutboxPublisher {
    public static final String EXCHANGE = "enziurooms.financial";
    public static final String ROUTING_KEY = "booking.room-change.credit.requested";
    public static final String SIGNATURE_HEADER = "X-Enziu-Financial-Signature";

    private static final Logger log = LoggerFactory.getLogger(RoomChangeFinancialOutboxPublisher.class);

    private final RoomChangeFinancialOutboxRepository repository;
    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper;
    private final RoomChangeFinancialMessageSigner messageSigner;

    public RoomChangeFinancialOutboxPublisher(
            RoomChangeFinancialOutboxRepository repository,
            @Qualifier(RoomChangeFinancialRabbitConfig.FINANCIAL_TEMPLATE)
            RabbitTemplate rabbitTemplate,
            ObjectMapper objectMapper,
            RoomChangeFinancialMessageSigner messageSigner
    ) {
        this.repository = repository;
        this.rabbitTemplate = rabbitTemplate;
        this.objectMapper = objectMapper;
        this.messageSigner = messageSigner;
    }

    @Scheduled(
            initialDelayString = "${features.room-change-outbox.initial-delay-ms:5000}",
            fixedDelayString = "${features.room-change-outbox.scan-delay-ms:3000}"
    )
    @Transactional
    public void publishPending() {
        for (RoomChangeFinancialOutboxEvent event : repository.lockNextBatch()) {
            try {
                FinancialCommand payload = new FinancialCommand(
                        event.getEventId(),
                        event.getRoomChangeId(),
                        event.getRoomChangeVersion(),
                        event.getBookingId(),
                        event.getCustomerId(),
                        event.getNewBookingTotal(),
                        event.getExpectedNetRetainedAmount(),
                        event.getOccurredAt(),
                        event.getCorrelationId()
                );
                byte[] body = objectMapper.writeValueAsBytes(payload);
                var messageBuilder = MessageBuilder
                        .withBody(body)
                        .setContentType("application/json")
                        .setDeliveryMode(MessageDeliveryMode.PERSISTENT)
                        .setMessageId(event.getEventId().toString())
                        .setHeader(SIGNATURE_HEADER, messageSigner.sign(body));
                if (event.getCorrelationId() != null) {
                    messageBuilder.setCorrelationId(event.getCorrelationId());
                }
                Message message = messageBuilder.build();
                CorrelationData correlation = new CorrelationData(event.getEventId().toString());
                rabbitTemplate.send(EXCHANGE, ROUTING_KEY, message, correlation);
                CorrelationData.Confirm confirm = correlation.getFuture().get(5, TimeUnit.SECONDS);
                if (!confirm.isAck()) {
                    throw new IllegalStateException("RabbitMQ nack: " + confirm.getReason());
                }
                if (correlation.getReturned() != null) {
                    var returned = correlation.getReturned();
                    throw new IllegalStateException(
                            "RabbitMQ returned unroutable message: replyCode="
                                    + returned.getReplyCode()
                                    + ", replyText=" + returned.getReplyText()
                                    + ", exchange=" + returned.getExchange()
                                    + ", routingKey=" + returned.getRoutingKey()
                    );
                }
                event.markPublished();
            } catch (Exception exception) {
                event.scheduleRetry(exception.getMessage());
                log.warn("Room-change financial event {} publish failed; retry scheduled: {}",
                        event.getEventId(), exception.getMessage());
            }
        }
    }

    public record FinancialCommand(
            java.util.UUID eventId,
            java.util.UUID roomChangeId,
            long roomChangeVersion,
            java.util.UUID bookingId,
            java.util.UUID customerId,
            java.math.BigDecimal newWholeBookingTotal,
            java.math.BigDecimal expectedNetRetainedAmount,
            java.time.Instant occurredAt,
            String correlationId
    ) {}
}
