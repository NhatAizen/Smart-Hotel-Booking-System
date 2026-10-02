package com.smarthotel.payment.wallet.roomchange;

import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@Component
@ConditionalOnProperty(name = "features.room-change-customer-wallet-credit-enabled", havingValue = "true")
public class RoomChangeResultOutboxPublisher {
    public static final String ROUTING_KEY = "payment.room-change.reconciled";
    private final RoomChangeResultOutboxRepository repository;
    private final RabbitTemplate template;
    private final RoomChangeFinancialMessageVerifier signatures;
    public RoomChangeResultOutboxPublisher(RoomChangeResultOutboxRepository repository,
            @Qualifier("roomChangeResultRabbitTemplate") RabbitTemplate template, RoomChangeFinancialMessageVerifier signatures) {
        this.repository = repository; this.template = template; this.signatures = signatures;
    }
    @Scheduled(initialDelayString = "${features.room-change-result.initial-delay-ms:5000}",
            fixedDelayString = "${features.room-change-result.scan-delay-ms:3000}")
    @Transactional
    public void publishPending() {
        for (RoomChangeResultOutbox event : repository.lockNextBatch()) {
            try {
                byte[] body = event.getResultPayload().getBytes(StandardCharsets.UTF_8);
                Message message = MessageBuilder.withBody(body).setContentType("application/json")
                        .setDeliveryMode(MessageDeliveryMode.PERSISTENT).setMessageId(event.getEventId().toString())
                        .setHeader("X-Enziu-Financial-Signature", signatures.sign(body)).build();
                CorrelationData correlation = new CorrelationData(event.getEventId().toString());
                template.send(RoomChangeFinancialRabbitConfig.EXCHANGE, ROUTING_KEY, message, correlation);
                if (!correlation.getFuture().get(5, TimeUnit.SECONDS).isAck() || correlation.getReturned() != null) {
                    throw new IllegalStateException("Result publish not ACK+routed");
                }
                event.published();
            } catch (Exception failure) { event.retry(failure.getMessage()); }
        }
    }
}
