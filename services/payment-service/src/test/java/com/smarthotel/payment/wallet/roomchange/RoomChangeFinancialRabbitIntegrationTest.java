package com.smarthotel.payment.wallet.roomchange;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.payment.integration.notification.NotificationClient;
import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentType;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.repository.WalletRepository;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.AmqpAdmin;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.listener.RabbitListenerEndpointRegistry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Opt-in end-to-end proof through a real, disposable localhost RabbitMQ:
 * exchange -> durable queue -> Payment listener -> inbox -> wallet ledger.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
                "features.room-change-customer-wallet-credit-enabled=true",
                "features.room-change-financial-hmac-secret="
                        + "booking-payment-financial-test-secret-32chars",
                "spring.datasource.url=jdbc:h2:mem:room_change_rabbit_it;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver",
                "spring.datasource.username=sa",
                "spring.datasource.password=",
                "spring.jpa.hibernate.ddl-auto=create-drop",
                "spring.jpa.show-sql=false",
                "spring.flyway.enabled=false",
                "security.jwt.secret=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
                "payos.enabled=false",
                "payos.payout.enabled=false",
                "wallet.settlement.initial-delay-ms=3600000",
                "wallet.settlement.scan-delay-ms=3600000",
                "spring.rabbitmq.listener.simple.prefetch=1"
        }
)
@EnabledIfEnvironmentVariable(named = "CI_RABBIT_INTEGRATION", matches = "(?i)true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RoomChangeFinancialRabbitIntegrationTest {
    private static final String FINANCIAL_SECRET =
            "booking-payment-financial-test-secret-32chars";
    @Autowired PaymentRepository payments;
    @Autowired WalletRepository wallets;
    @Autowired JdbcTemplate jdbc;
    @Autowired RabbitTemplate rabbitTemplate;
    @Autowired AmqpAdmin rabbitAdmin;
    @Autowired RabbitListenerEndpointRegistry listenerRegistry;
    @Autowired ObjectMapper objectMapper;
    @MockBean NotificationClient notificationClient;

    @DynamicPropertySource
    static void disposableRabbitProperties(DynamicPropertyRegistry registry) {
        String host = environment("CI_RABBIT_HOST", "127.0.0.1");
        requireLoopback(host);
        registry.add("spring.rabbitmq.host", () -> host);
        registry.add("spring.rabbitmq.port",
                () -> Integer.parseInt(environment("CI_RABBIT_PORT", "5672")));
        registry.add("spring.rabbitmq.username",
                () -> environment("CI_RABBIT_USERNAME", "guest"));
        registry.add("spring.rabbitmq.password",
                () -> environment("CI_RABBIT_PASSWORD", "guest"));
        registry.add("spring.rabbitmq.virtual-host",
                () -> environment("CI_RABBIT_VHOST", "/"));
    }

    @BeforeEach
    void prepareDatabaseAndQueue() {
        rabbitAdmin.initialize();
        rabbitAdmin.purgeQueue(RoomChangeFinancialRabbitConfig.QUEUE, false);
        rabbitAdmin.purgeQueue(RoomChangeFinancialRabbitConfig.DEAD_LETTER_QUEUE, false);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS booking_financial_locks (
                    booking_id UUID PRIMARY KEY,
                    last_room_change_version BIGINT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT ck_rabbit_it_lock_version CHECK (last_room_change_version >= 0)
                )
                """);
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS financial_event_inbox (
                    id UUID PRIMARY KEY,
                    operation_type VARCHAR(60) NOT NULL,
                    operation_id UUID NOT NULL,
                    booking_id UUID NOT NULL,
                    room_change_version BIGINT NOT NULL,
                    customer_id UUID NOT NULL,
                    new_booking_total NUMERIC(16,2) NOT NULL,
                    expected_net_retained_amount NUMERIC(16,2) NOT NULL,
                    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    correlation_id VARCHAR(160),
                    valid_paid_amount NUMERIC(16,2),
                    credited_amount NUMERIC(16,2),
                    processed_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    CONSTRAINT uq_rabbit_it_operation UNIQUE (operation_type, operation_id),
                    CONSTRAINT uq_rabbit_it_booking_version UNIQUE (
                        operation_type, booking_id, room_change_version
                    )
                )
                """);

        jdbc.update("DELETE FROM financial_event_inbox");
        jdbc.update("DELETE FROM booking_financial_locks");
        jdbc.update("DELETE FROM wallet_transactions");
        jdbc.update("DELETE FROM wallets");
        jdbc.update("DELETE FROM payments");
    }

    @AfterAll
    void stopListenerAndCleanDisposableTopology() {
        listenerRegistry.stop();
        rabbitAdmin.deleteQueue(RoomChangeFinancialRabbitConfig.QUEUE);
        rabbitAdmin.deleteQueue(RoomChangeFinancialRabbitConfig.DEAD_LETTER_QUEUE);
        rabbitAdmin.deleteExchange(RoomChangeFinancialRabbitConfig.EXCHANGE);
        rabbitAdmin.deleteExchange(RoomChangeFinancialRabbitConfig.DEAD_LETTER_EXCHANGE);
    }

    @Test
    void duplicateRealDeliveriesCreateOneInboxResultAndOneWalletCredit() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Payment payment = new Payment(
                bookingId,
                customerId,
                new BigDecimal("1000000"),
                PaymentMethod.PAYOS,
                PaymentType.FULL_PAYMENT
        );
        payment.markPaid("RABBIT-IT-" + UUID.randomUUID());
        payment.markWalletApplied();
        payment.markBookingApplied();
        ReflectionTestUtils.setField(payment, "paidAt", Instant.now().minusSeconds(1));
        payments.saveAndFlush(payment);

        UUID eventId = UUID.randomUUID();
        RoomChangeFinancialCommand command = new RoomChangeFinancialCommand(
                eventId,
                eventId,
                1L,
                bookingId,
                customerId,
                new BigDecimal("600000"),
                new BigDecimal("1000000"),
                Instant.now(),
                "rabbit-e2e-" + eventId
        );
        byte[] json = objectMapper.writeValueAsBytes(command);

        sendPersistent(json, eventId);
        sendPersistent(json, eventId);

        await("financial command was not processed", 15, () -> {
            Integer completed = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM financial_event_inbox
                    WHERE operation_type = 'ROOM_CHANGE_CREDIT'
                      AND operation_id = ?
                      AND valid_paid_amount = 1000000
                      AND credited_amount = 400000
                    """, Integer.class, eventId);
            return completed != null && completed == 1;
        });
        await("expected queue did not drain", 10, () -> {
            var properties = rabbitAdmin.getQueueProperties(
                    RoomChangeFinancialRabbitConfig.QUEUE
            );
            Object count = properties == null ? null
                    : properties.get(RabbitAdmin.QUEUE_MESSAGE_COUNT);
            return count instanceof Number number && number.intValue() == 0;
        });

        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM financial_event_inbox
                WHERE operation_type = 'ROOM_CHANGE_CREDIT' AND operation_id = ?
                """, Integer.class, eventId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM wallet_transactions
                WHERE idempotency_key = ?
                """, Integer.class, "ROOM_CHANGE_CREDIT:" + eventId)).isEqualTo(1);
        assertThat(wallets.findByOwnerTypeAndOwnerId(
                WalletOwnerType.CUSTOMER, customerId
        )).get().extracting(wallet -> wallet.getAvailableBalance())
                .isEqualTo(new BigDecimal("400000.00"));
        assertThat(jdbc.queryForObject("""
                SELECT last_room_change_version FROM booking_financial_locks
                WHERE booking_id = ?
                """, Long.class, bookingId)).isEqualTo(1L);
        assertThat(rabbitAdmin.getQueueProperties(
                RoomChangeFinancialRabbitConfig.DEAD_LETTER_QUEUE
        )).containsEntry(RabbitAdmin.QUEUE_MESSAGE_COUNT, 0);
    }

    private void sendPersistent(byte[] json, UUID eventId) {
        Message message = MessageBuilder.withBody(json)
                .setContentType("application/json")
                .setDeliveryMode(MessageDeliveryMode.PERSISTENT)
                .setMessageId(eventId.toString())
                .setHeader("X-Enziu-Financial-Signature", sign(json))
                .build();
        rabbitTemplate.send(
                RoomChangeFinancialRabbitConfig.EXCHANGE,
                RoomChangeFinancialRabbitConfig.ROUTING_KEY,
                message
        );
    }

    @Test
    void invalidSignatureIsRetriedThenDeadLetteredWithoutFinancialMutation() throws Exception {
        UUID eventId = UUID.randomUUID();
        byte[] json = objectMapper.writeValueAsBytes(new RoomChangeFinancialCommand(
                eventId, eventId, 1L, UUID.randomUUID(), UUID.randomUUID(),
                new BigDecimal("600000"), new BigDecimal("1000000"), Instant.now(), "bad-signature"));
        rabbitTemplate.send(RoomChangeFinancialRabbitConfig.EXCHANGE,
                RoomChangeFinancialRabbitConfig.ROUTING_KEY, MessageBuilder.withBody(json)
                        .setContentType("application/json")
                        .setDeliveryMode(MessageDeliveryMode.PERSISTENT)
                        .setMessageId(eventId.toString())
                        .setHeader("X-Enziu-Financial-Signature", Base64.getEncoder().encodeToString(new byte[32]))
                        .build());
        await("invalid signature was not dead-lettered", 35, () ->
                rabbitAdmin.getQueueProperties(RoomChangeFinancialRabbitConfig.DEAD_LETTER_QUEUE)
                        .get(RabbitAdmin.QUEUE_MESSAGE_COUNT).equals(1));
        Message rejected = rabbitTemplate.receive(RoomChangeFinancialRabbitConfig.DEAD_LETTER_QUEUE, 5000);
        assertThat(rejected).isNotNull();
        assertThat(rejected.getBody()).isEqualTo(json);
        assertThat(rejected.getMessageProperties().getHeaders()).containsKey("x-death");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM financial_event_inbox", Long.class)).isZero();
        assertThat(wallets.count()).isZero();
    }

    @Test
    void consumerRetrySucceedsAfterAuthoritativePaymentBecomesVisible() throws Exception {
        UUID eventId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Instant occurredAt = Instant.now().plusSeconds(3);
        byte[] json = objectMapper.writeValueAsBytes(new RoomChangeFinancialCommand(
                eventId, eventId, 1L, bookingId, customerId,
                new BigDecimal("600000"), new BigDecimal("1000000"), occurredAt, "visibility-retry"));
        sendPersistent(json, eventId);
        // Allow the initial delivery to fail before making the payment visible.
        Thread.sleep(600);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM financial_event_inbox", Long.class)).isZero();
        Payment payment = new Payment(bookingId, customerId, new BigDecimal("1000000"),
                PaymentMethod.PAYOS, PaymentType.FULL_PAYMENT);
        payment.markPaid("RETRY-" + eventId);
        payment.markWalletApplied();
        payment.markBookingApplied();
        ReflectionTestUtils.setField(payment, "paidAt", occurredAt.minusSeconds(1));
        payments.saveAndFlush(payment);
        await("consumer retry did not reconcile", 15, () -> jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox WHERE operation_id = ? AND credited_amount = 400000",
                Integer.class, eventId) == 1);
        assertThat(wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId))
                .get().extracting(wallet -> wallet.getAvailableBalance()).isEqualTo(new BigDecimal("400000.00"));
    }

    private static String sign(byte[] payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    FINANCIAL_SECRET.getBytes(StandardCharsets.UTF_8),
                    "HmacSHA256"
            ));
            return Base64.getEncoder().encodeToString(mac.doFinal(payload));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static void await(
            String failureMessage,
            int timeoutSeconds,
            BooleanSupplier condition
    ) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) return;
            Thread.sleep(100);
        }
        throw new AssertionError(failureMessage);
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
