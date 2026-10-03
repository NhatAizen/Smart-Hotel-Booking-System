package com.smarthotel.booking.booking.roomchange.financial;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Real-broker contract proof. It is deliberately opt-in and refuses every
 * non-loopback host so it can only target a disposable local RabbitMQ.
 */
@EnabledIfEnvironmentVariable(named = "CI_RABBIT_INTEGRATION", matches = "(?i)true")
class RoomChangeFinancialRabbitIntegrationTest {
    private static final String QUEUE = "enziurooms.payment.room-change-credit";
    private static final String DEAD_LETTER_EXCHANGE = "enziurooms.financial.dlx";
    private static final String DEAD_LETTER_QUEUE = "enziurooms.payment.room-change-credit.dlq";
    private static final String DEAD_LETTER_ROUTING_KEY = "booking.room-change.credit.failed";

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private CachingConnectionFactory connectionFactory;
    private RabbitAdmin rabbitAdmin;
    private RabbitTemplate rabbitTemplate;

    @BeforeEach
    void connectToDisposableLoopbackBroker() {
        String host = environment("CI_RABBIT_HOST", "127.0.0.1");
        requireLoopback(host);
        int port = Integer.parseInt(environment("CI_RABBIT_PORT", "5672"));

        connectionFactory = new CachingConnectionFactory(host, port);
        connectionFactory.setUsername(environment("CI_RABBIT_USERNAME", "guest"));
        connectionFactory.setPassword(environment("CI_RABBIT_PASSWORD", "guest"));
        connectionFactory.setVirtualHost(environment("CI_RABBIT_VHOST", "/"));
        connectionFactory.setPublisherConfirmType(
                CachingConnectionFactory.ConfirmType.CORRELATED
        );
        connectionFactory.setPublisherReturns(true);

        rabbitAdmin = new RabbitAdmin(connectionFactory);
        rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMandatory(true);

        deleteFinancialTopology();
        rabbitAdmin.declareExchange(new TopicExchange(
                RoomChangeFinancialOutboxPublisher.EXCHANGE, true, false
        ));
    }

    @AfterEach
    void disconnectAndCleanTopology() {
        if (rabbitAdmin != null) deleteFinancialTopology();
        if (connectionFactory != null) connectionFactory.destroy();
    }

    @Test
    void actualPublisherRoutesPersistentVersionedCommandToExpectedDurableQueue() throws Exception {
        TopicExchange exchange = new TopicExchange(
                RoomChangeFinancialOutboxPublisher.EXCHANGE, true, false
        );
        TopicExchange deadLetterExchange = new TopicExchange(
                DEAD_LETTER_EXCHANGE, true, false
        );
        var queue = QueueBuilder.durable(QUEUE)
                .deadLetterExchange(DEAD_LETTER_EXCHANGE)
                .deadLetterRoutingKey(DEAD_LETTER_ROUTING_KEY)
                .build();
        var deadLetterQueue = QueueBuilder.durable(DEAD_LETTER_QUEUE).build();
        rabbitAdmin.declareExchange(deadLetterExchange);
        rabbitAdmin.declareQueue(queue);
        rabbitAdmin.declareQueue(deadLetterQueue);
        rabbitAdmin.declareBinding(BindingBuilder.bind(queue).to(exchange)
                .with(RoomChangeFinancialOutboxPublisher.ROUTING_KEY));
        rabbitAdmin.declareBinding(BindingBuilder.bind(deadLetterQueue)
                .to(deadLetterExchange).with(DEAD_LETTER_ROUTING_KEY));

        RoomChangeFinancialOutboxEvent event = event();
        publisher(event).publishPending();

        assertThat(event.getStatus()).isEqualTo("PUBLISHED");
        assertThat(event.getPublishAttempts()).isZero();

        Message delivered = rabbitTemplate.receive(QUEUE, 5_000);
        assertThat(delivered).isNotNull();
        // AMQP maps the producer delivery mode into receivedDeliveryMode on an
        // inbound/basic.get message.
        assertThat(delivered.getMessageProperties().getReceivedDeliveryMode())
                .isEqualTo(MessageDeliveryMode.PERSISTENT);
        assertThat(delivered.getMessageProperties().getMessageId())
                .isEqualTo(event.getEventId().toString());
        assertThat(delivered.getMessageProperties().getHeaders())
                .containsKey(RoomChangeFinancialOutboxPublisher.SIGNATURE_HEADER);

        JsonNode json = objectMapper.readTree(delivered.getBody());
        assertThat(json.path("eventId").asText()).isEqualTo(event.getEventId().toString());
        assertThat(json.path("roomChangeId").asText())
                .isEqualTo(event.getRoomChangeId().toString());
        assertThat(json.path("roomChangeVersion").asLong())
                .isEqualTo(event.getRoomChangeVersion());
        assertThat(json.path("bookingId").asText()).isEqualTo(event.getBookingId().toString());
        assertThat(json.path("customerId").asText()).isEqualTo(event.getCustomerId().toString());
        assertThat(json.path("expectedNetRetainedAmount").decimalValue())
                .isEqualByComparingTo(event.getExpectedNetRetainedAmount());
    }

    @Test
    void actualMandatoryReturnKeepsUnroutableOutboxEventPending() {
        // The durable financial exchange exists, but there is intentionally no
        // queue/binding for the command routing key.
        RoomChangeFinancialOutboxEvent event = event();

        publisher(event).publishPending();

        assertThat(event.getStatus()).isEqualTo("PENDING");
        assertThat(event.getPublishedAt()).isNull();
        assertThat(event.getPublishAttempts()).isEqualTo(1);
        assertThat(event.getLastError())
                .contains("unroutable")
                .contains("NO_ROUTE");
    }

    @Test
    void realBrokerNackKeepsOutboxPending() throws Exception {
        var queue = QueueBuilder.durable(QUEUE).withArguments(Map.of(
                "x-max-length", 1, "x-overflow", "reject-publish")).build();
        rabbitAdmin.declareQueue(queue);
        rabbitAdmin.declareBinding(BindingBuilder.bind(queue).to(new TopicExchange(
                RoomChangeFinancialOutboxPublisher.EXCHANGE, true, false))
                .with(RoomChangeFinancialOutboxPublisher.ROUTING_KEY));
        rabbitTemplate.send(RoomChangeFinancialOutboxPublisher.EXCHANGE,
                RoomChangeFinancialOutboxPublisher.ROUTING_KEY,
                new Message(new byte[]{1}, new org.springframework.amqp.core.MessageProperties()));
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        while ((Integer) rabbitAdmin.getQueueProperties(QUEUE).get(RabbitAdmin.QUEUE_MESSAGE_COUNT) != 1
                && System.nanoTime() < deadline) Thread.sleep(50);
        assertThat(rabbitAdmin.getQueueProperties(QUEUE)).containsEntry(RabbitAdmin.QUEUE_MESSAGE_COUNT, 1);

        RoomChangeFinancialOutboxEvent event = event();
        publisher(event).publishPending();
        assertThat(event.getStatus()).isEqualTo("PENDING");
        assertThat(event.getPublishedAt()).isNull();
        assertThat(event.getLastError()).contains("nack");
    }

    @Test
    void returnedEventEventuallyPublishesAfterBindingAppears() {
        RoomChangeFinancialOutboxEvent event = event();
        RoomChangeFinancialOutboxPublisher publisher = publisher(event);
        publisher.publishPending();
        assertThat(event.getStatus()).isEqualTo("PENDING");
        var queue = QueueBuilder.durable(QUEUE).build();
        rabbitAdmin.declareQueue(queue);
        rabbitAdmin.declareBinding(BindingBuilder.bind(queue).to(new TopicExchange(
                RoomChangeFinancialOutboxPublisher.EXCHANGE, true, false))
                .with(RoomChangeFinancialOutboxPublisher.ROUTING_KEY));
        publisher.publishPending();
        assertThat(event.getStatus()).isEqualTo("PUBLISHED");
        assertThat(rabbitTemplate.receive(QUEUE, 5000)).isNotNull();
    }

    private RoomChangeFinancialOutboxPublisher publisher(
            RoomChangeFinancialOutboxEvent event
    ) {
        RoomChangeFinancialOutboxRepository repository =
                mock(RoomChangeFinancialOutboxRepository.class);
        when(repository.lockNextBatch()).thenReturn(List.of(event));
        return new RoomChangeFinancialOutboxPublisher(
                repository, rabbitTemplate, objectMapper,
                new RoomChangeFinancialMessageSigner(
                        "booking-payment-financial-test-secret-32chars"
                )
        );
    }

    private static RoomChangeFinancialOutboxEvent event() {
        UUID eventId = UUID.randomUUID();
        return new RoomChangeFinancialOutboxEvent(
                eventId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                new BigDecimal("600000"),
                new BigDecimal("1000000"),
                1L,
                Instant.now(),
                "rabbit-it-" + eventId
        );
    }

    private void deleteFinancialTopology() {
        rabbitAdmin.deleteQueue(QUEUE);
        rabbitAdmin.deleteQueue(DEAD_LETTER_QUEUE);
        rabbitAdmin.deleteExchange(RoomChangeFinancialOutboxPublisher.EXCHANGE);
        rabbitAdmin.deleteExchange(DEAD_LETTER_EXCHANGE);
    }

    private static String environment(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static void requireLoopback(String host) {
        if (!Set.of("localhost", "127.0.0.1", "::1").contains(host.toLowerCase())) {
            throw new IllegalStateException(
                    "Rabbit integration test refuses non-loopback host: " + host
            );
        }
    }
}
