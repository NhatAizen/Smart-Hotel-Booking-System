package com.smarthotel.booking.booking.roomchange.financial;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.booking.realtime.RealtimeEventPublisher;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.core.RabbitOperations;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.amqp.RabbitProperties;
import org.springframework.boot.autoconfigure.amqp.RabbitTemplateConfigurer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class RoomChangeFinancialRabbitConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(TestConfiguration.class)
            .withBean(ConnectionFactory.class, () -> mock(ConnectionFactory.class))
            .withBean(RoomChangeFinancialOutboxRepository.class,
                    () -> mock(RoomChangeFinancialOutboxRepository.class))
            .withBean(ObjectMapper.class, () -> new ObjectMapper().findAndRegisterModules())
            .withBean(RabbitTemplateConfigurer.class, () -> {
                RabbitTemplateConfigurer configurer =
                        new RabbitTemplateConfigurer(new RabbitProperties());
                configurer.setMessageConverter(new Jackson2JsonMessageConverter(
                        new ObjectMapper().findAndRegisterModules()
                ));
                return configurer;
            });

    @Test
    void featureOffCreatesNoFinancialPublisherOrTopology() {
        contextRunner.run(context -> {
            assertThat(context).doesNotHaveBean(RoomChangeFinancialOutboxPublisher.class);
            assertThat(context).doesNotHaveBean(RoomChangeFinancialRabbitConfig.class);
            assertThat(context).doesNotHaveBean(RoomChangeFinancialRabbitConfig.FINANCIAL_TEMPLATE);
            assertThat(context).hasBean(RoomChangeFinancialRabbitConfig.DEFAULT_TEMPLATE);
        });
    }

    @Test
    void featureOnCreatesDurableExchangeAndMandatoryDedicatedTemplate() {
        contextRunner
                .withPropertyValues(
                        "features.room-change-customer-wallet-credit-enabled=true",
                        "features.room-change-financial-hmac-secret="
                                + "booking-payment-financial-test-secret-32chars"
                )
                .run(context -> {
                    assertThat(context).hasSingleBean(RoomChangeFinancialOutboxPublisher.class);
                    assertThat(context).hasSingleBean(RoomChangeFinancialRabbitConfig.class);

                    var exchange = context.getBean(
                            "enziuFinancialExchange",
                            org.springframework.amqp.core.TopicExchange.class
                    );
                    assertThat(exchange.isDurable()).isTrue();
                    assertThat(exchange.isAutoDelete()).isFalse();

                    RabbitTemplate financialTemplate = context.getBean(
                            RoomChangeFinancialRabbitConfig.FINANCIAL_TEMPLATE,
                            RabbitTemplate.class
                    );
                    RabbitTemplate defaultTemplate = context.getBean(
                            RoomChangeFinancialRabbitConfig.DEFAULT_TEMPLATE,
                            RabbitTemplate.class
                    );
                    Message message = MessageBuilder.withBody(new byte[]{1}).build();
                    assertThat(financialTemplate).isNotSameAs(defaultTemplate);
                    assertThat(financialTemplate.isMandatoryFor(message)).isTrue();
                    assertThat(defaultTemplate.isMandatoryFor(message)).isFalse();
                    assertThat(financialTemplate.getMessageConverter())
                            .isInstanceOf(Jackson2JsonMessageConverter.class);
                    assertThat(defaultTemplate.getMessageConverter())
                            .isInstanceOf(Jackson2JsonMessageConverter.class);

                    RealtimeEventPublisher realtimePublisher =
                            context.getBean(RealtimeEventPublisher.class);
                    assertThat(ReflectionTestUtils.getField(
                            realtimePublisher, "rabbitTemplate"
                    )).isSameAs(defaultTemplate);
                });
    }

    @Configuration(proxyBeanMethods = false)
    @Import({
            RoomChangeFinancialRabbitConfig.class,
            RoomChangeFinancialMessageSigner.class,
            RoomChangeFinancialOutboxPublisher.class,
            RealtimeEventPublisher.class
    })
    static class TestConfiguration {
        @Bean(name = RoomChangeFinancialRabbitConfig.DEFAULT_TEMPLATE)
        @ConditionalOnMissingBean(RabbitOperations.class)
        RabbitTemplate bootLikeDefaultTemplate(
                RabbitTemplateConfigurer configurer,
                ConnectionFactory connectionFactory
        ) {
            RabbitTemplate template = new RabbitTemplate();
            configurer.configure(template, connectionFactory);
            return template;
        }
    }
}
