package com.smarthotel.payment.wallet.roomchange;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class RoomChangeFinancialRabbitConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(TestConfiguration.class)
            .withBean(ConnectionFactory.class, () -> mock(ConnectionFactory.class))
            .withBean(ObjectMapper.class, () -> new ObjectMapper().findAndRegisterModules())
            .withBean(RoomChangeResultOutboxRepository.class, () -> mock(RoomChangeResultOutboxRepository.class))
            .withBean(RoomChangeReconciliationService.class, () -> mock(RoomChangeReconciliationService.class));

    @Test
    void featureOffCreatesNoFinancialConsumerOrTopology() {
        contextRunner.run(context -> {
            assertThat(context).doesNotHaveBean(RoomChangeFinancialRabbitConfig.class);
            assertThat(context).doesNotHaveBean(RoomChangeFinancialCommandListener.class);
            assertThat(context).doesNotHaveBean(RoomChangeResultOutboxPublisher.class);
            assertThat(context).doesNotHaveBean("roomChangeResultRabbitTemplate");
            assertThat(context).doesNotHaveBean("roomChangeCreditQueue");
            assertThat(context).doesNotHaveBean("roomChangeFinancialListenerContainerFactory");
        });
    }

    @Test
    void featureOnDeclaresDurableQueueWithBrokerDeadLettering() {
        contextRunner
                .withPropertyValues(
                        "features.room-change-customer-wallet-credit-enabled=true",
                        "features.room-change-financial-hmac-secret="
                                + "booking-payment-financial-test-secret-32chars"
                )
                .run(context -> {
                    assertThat(context).hasSingleBean(RoomChangeFinancialRabbitConfig.class);
                    assertThat(context).hasSingleBean(RoomChangeFinancialCommandListener.class);

                    var exchange = context.getBean(
                            "financialExchange",
                            org.springframework.amqp.core.TopicExchange.class
                    );
                    assertThat(exchange.isDurable()).isTrue();
                    assertThat(exchange.isAutoDelete()).isFalse();

                    var queue = context.getBean(
                            "roomChangeCreditQueue",
                            org.springframework.amqp.core.Queue.class
                    );
                    assertThat(queue.isDurable()).isTrue();
                    assertThat(queue.isExclusive()).isFalse();
                    assertThat(queue.isAutoDelete()).isFalse();
                    assertThat(queue.getArguments())
                            .containsEntry(
                                    "x-dead-letter-exchange",
                                    RoomChangeFinancialRabbitConfig.DEAD_LETTER_EXCHANGE
                            )
                            .containsEntry(
                                    "x-dead-letter-routing-key",
                                    RoomChangeFinancialRabbitConfig.DEAD_LETTER_ROUTING_KEY
                            );

                    var deadLetterQueue = context.getBean(
                            "roomChangeCreditDeadLetterQueue",
                            org.springframework.amqp.core.Queue.class
                    );
                    assertThat(deadLetterQueue.isDurable()).isTrue();

                    var deadLetterBinding = context.getBean(
                            "roomChangeCreditDeadLetterBinding",
                            org.springframework.amqp.core.Binding.class
                    );
                    assertThat(deadLetterBinding.getRoutingKey())
                            .isEqualTo(RoomChangeFinancialRabbitConfig.DEAD_LETTER_ROUTING_KEY);
                });
    }

    @Configuration(proxyBeanMethods = false)
    @Import({
            RoomChangeFinancialRabbitConfig.class,
            RoomChangeFinancialMessageVerifier.class,
            RoomChangeFinancialCommandListener.class
            , RoomChangeResultOutboxPublisher.class
    })
    static class TestConfiguration {}
}
