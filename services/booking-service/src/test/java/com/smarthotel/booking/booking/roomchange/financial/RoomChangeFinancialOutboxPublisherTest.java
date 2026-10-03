package com.smarthotel.booking.booking.roomchange.financial;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.ReturnedMessage;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

class RoomChangeFinancialOutboxPublisherTest {
    @Test
    void brokerFailureKeepsEventPendingAndSchedulesRetry() {
        RoomChangeFinancialOutboxRepository repository = mock(RoomChangeFinancialOutboxRepository.class);
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        RoomChangeFinancialOutboxEvent event = event();
        when(repository.lockNextBatch()).thenReturn(List.of(event));
        doThrow(new IllegalStateException("broker unavailable")).when(rabbitTemplate)
                .send(anyString(), anyString(), any(), any());
        RoomChangeFinancialOutboxPublisher publisher = new RoomChangeFinancialOutboxPublisher(
                repository, rabbitTemplate, new ObjectMapper().findAndRegisterModules(), signer()
        );

        publisher.publishPending();

        assertThat(event.getStatus()).isEqualTo("PENDING");
        assertThat(event.getPublishAttempts()).isEqualTo(1);
        assertThat(event.getLastError()).contains("broker unavailable");
    }

    @Test
    void confirmedPersistentMessageIsMarkedPublished() {
        Fixture fixture = fixture();
        doAnswer(invocation -> {
            Message message = invocation.getArgument(2);
            assertThat(message.getMessageProperties().getDeliveryMode())
                    .isEqualTo(MessageDeliveryMode.PERSISTENT);
            assertThat(message.getMessageProperties().getMessageId())
                    .isEqualTo(fixture.event().getEventId().toString());
            CorrelationData correlation = invocation.getArgument(3);
            correlation.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(fixture.rabbitTemplate()).send(anyString(), anyString(), any(), any());

        fixture.publisher().publishPending();

        assertThat(fixture.event().getStatus()).isEqualTo("PUBLISHED");
        assertThat(fixture.event().getPublishedAt()).isNotNull();
        assertThat(fixture.event().getPublishAttempts()).isZero();
    }

    @Test
    void brokerNackKeepsEventPendingForRetry() {
        Fixture fixture = fixture();
        doAnswer(invocation -> {
            CorrelationData correlation = invocation.getArgument(3);
            correlation.getFuture().complete(new CorrelationData.Confirm(false, "disk alarm"));
            return null;
        }).when(fixture.rabbitTemplate()).send(anyString(), anyString(), any(), any());

        fixture.publisher().publishPending();

        assertThat(fixture.event().getStatus()).isEqualTo("PENDING");
        assertThat(fixture.event().getPublishAttempts()).isEqualTo(1);
        assertThat(fixture.event().getLastError()).contains("nack").contains("disk alarm");
    }

    @Test
    void mandatoryReturnKeepsUnroutableEventPendingDespiteAck() {
        Fixture fixture = fixture();
        doAnswer(invocation -> {
            Message message = invocation.getArgument(2);
            CorrelationData correlation = invocation.getArgument(3);
            correlation.setReturned(new ReturnedMessage(
                    message,
                    312,
                    "NO_ROUTE",
                    RoomChangeFinancialOutboxPublisher.EXCHANGE,
                    RoomChangeFinancialOutboxPublisher.ROUTING_KEY
            ));
            correlation.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(fixture.rabbitTemplate()).send(anyString(), anyString(), any(), any());

        fixture.publisher().publishPending();

        assertThat(fixture.event().getStatus()).isEqualTo("PENDING");
        assertThat(fixture.event().getPublishAttempts()).isEqualTo(1);
        assertThat(fixture.event().getLastError())
                .contains("unroutable")
                .contains("NO_ROUTE");
    }

    private static Fixture fixture() {
        RoomChangeFinancialOutboxRepository repository = mock(RoomChangeFinancialOutboxRepository.class);
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        RoomChangeFinancialOutboxEvent event = event();
        when(repository.lockNextBatch()).thenReturn(List.of(event));
        return new Fixture(
                event,
                rabbitTemplate,
                new RoomChangeFinancialOutboxPublisher(
                        repository, rabbitTemplate, new ObjectMapper().findAndRegisterModules(), signer()
                )
        );
    }

    private static RoomChangeFinancialOutboxEvent event() {
        UUID id = UUID.randomUUID();
        return new RoomChangeFinancialOutboxEvent(
                id, UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("600000"),
                new BigDecimal("1000000"), 1L, Instant.now(), "test"
        );
    }

    private static RoomChangeFinancialMessageSigner signer() {
        return new RoomChangeFinancialMessageSigner(
                "booking-payment-financial-test-secret-32chars"
        );
    }

    private record Fixture(
            RoomChangeFinancialOutboxEvent event,
            RabbitTemplate rabbitTemplate,
            RoomChangeFinancialOutboxPublisher publisher
    ) {}
}
