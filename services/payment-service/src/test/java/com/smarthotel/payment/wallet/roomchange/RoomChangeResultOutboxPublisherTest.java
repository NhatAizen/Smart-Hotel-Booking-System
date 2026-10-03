package com.smarthotel.payment.wallet.roomchange;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import java.time.Instant;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class RoomChangeResultOutboxPublisherTest {
    @Test void failureNackReturnAndRetryOnlyMarkRoutedAckPublished() {
        for (String failure : List.of("unavailable", "nack", "return")) {
            var repository = mock(RoomChangeResultOutboxRepository.class);
            var template = mock(RabbitTemplate.class);
            var signatures = new RoomChangeFinancialMessageVerifier("booking-payment-financial-test-secret-32chars");
            UUID eventId = UUID.randomUUID();
            var command = new RoomChangeFinancialCommand(eventId, eventId, 1, UUID.randomUUID(), UUID.randomUUID(),
                    new BigDecimal("1600000"), new BigDecimal("2000000"), Instant.now(), null);
            var event = new RoomChangeResultOutbox(command, "{}", "{\"outcome\":\"CONFIRMED\"}");
            when(repository.lockNextBatch()).thenReturn(List.of(event));
            doAnswer(invocation -> {
                if (failure.equals("unavailable")) throw new IllegalStateException("Broker unavailable");
                Message message = invocation.getArgument(2);
                CorrelationData correlation = invocation.getArgument(3);
                if (failure.equals("return")) correlation.setReturned(new ReturnedMessage(message, 312, "NO_ROUTE", "enziurooms.financial", RoomChangeResultOutboxPublisher.ROUTING_KEY));
                correlation.getFuture().complete(new CorrelationData.Confirm(!failure.equals("nack"), "fixture"));
                return null;
            }).when(template).send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));
            var publisher = new RoomChangeResultOutboxPublisher(repository, template, signatures);
            publisher.publishPending();
            assertThat(event.getStatus()).isEqualTo("PENDING");
            assertThat(event.getPublishAttempts()).isEqualTo(1);
            doAnswer(invocation -> {
                Message message = invocation.getArgument(2);
                assertThat(invocation.<String>getArgument(1)).isEqualTo(RoomChangeResultOutboxPublisher.ROUTING_KEY);
                assertThat(message.getMessageProperties().getDeliveryMode()).isEqualTo(MessageDeliveryMode.PERSISTENT);
                signatures.verify(message.getBody(), message.getMessageProperties().getHeader("X-Enziu-Financial-Signature"));
                invocation.<CorrelationData>getArgument(3).getFuture().complete(new CorrelationData.Confirm(true, null));
                return null;
            }).when(template).send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));
            publisher.publishPending();
            assertThat(event.getStatus()).isEqualTo("PUBLISHED");
        }
    }
}
