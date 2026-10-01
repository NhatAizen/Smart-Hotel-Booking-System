package com.smarthotel.booking.booking.roomchange.financial;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.amqp.RabbitTemplateConfigurer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

@Configuration
@ConditionalOnProperty(
        name = "features.room-change-customer-wallet-credit-enabled",
        havingValue = "true"
)
public class RoomChangeFinancialRabbitConfig {
    public static final String DEFAULT_TEMPLATE = "rabbitTemplate";
    public static final String FINANCIAL_TEMPLATE = "roomChangeFinancialRabbitTemplate";

    @Bean
    public TopicExchange enziuFinancialExchange() {
        return new TopicExchange(RoomChangeFinancialOutboxPublisher.EXCHANGE, true, false);
    }

    @Bean(name = DEFAULT_TEMPLATE)
    @Primary
    public RabbitTemplate defaultRabbitTemplate(
            RabbitTemplateConfigurer configurer,
            ConnectionFactory connectionFactory
    ) {
        RabbitTemplate template = new RabbitTemplate();
        configurer.configure(template, connectionFactory);
        template.setMandatory(false);
        return template;
    }

    /** Keep mandatory publishing scoped to the financial outbox template. */
    @Bean(name = FINANCIAL_TEMPLATE)
    public RabbitTemplate roomChangeFinancialRabbitTemplate(
            RabbitTemplateConfigurer configurer,
            ConnectionFactory connectionFactory
    ) {
        RabbitTemplate template = new RabbitTemplate();
        configurer.configure(template, connectionFactory);
        template.setMandatory(true);
        return template;
    }
}
