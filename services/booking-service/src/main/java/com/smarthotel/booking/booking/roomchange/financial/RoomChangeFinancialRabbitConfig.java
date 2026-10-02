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
    public static final String RESULT_QUEUE = "enziurooms.booking.room-change-result";
    public static final String RESULT_ROUTING_KEY = "payment.room-change.reconciled";

    @Bean
    public org.springframework.amqp.core.Declarables roomChangeResultTopology() {
        var exchange = new TopicExchange(RoomChangeFinancialOutboxPublisher.EXCHANGE, true, false);
        var dlx = new TopicExchange("enziurooms.financial.dlx", true, false);
        var queue = org.springframework.amqp.core.QueueBuilder.durable(RESULT_QUEUE)
                .deadLetterExchange(dlx.getName()).deadLetterRoutingKey("payment.room-change.result.failed").build();
        var dlq = org.springframework.amqp.core.QueueBuilder.durable(RESULT_QUEUE + ".dlq").build();
        return new org.springframework.amqp.core.Declarables(queue, dlq, dlx,
                org.springframework.amqp.core.BindingBuilder.bind(queue).to(exchange).with(RESULT_ROUTING_KEY),
                org.springframework.amqp.core.BindingBuilder.bind(dlq).to(dlx).with("payment.room-change.result.failed"));
    }

    @Bean(name = "roomChangeResultListenerContainerFactory")
    public org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory roomChangeResultListenerContainerFactory(
            ConnectionFactory connectionFactory) {
        var factory = new org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setDefaultRequeueRejected(false);
        factory.setAdviceChain(org.springframework.amqp.rabbit.config.RetryInterceptorBuilder.stateless()
                .maxAttempts(5).backOffOptions(1000, 2.0, 10000)
                .recoverer(new org.springframework.amqp.rabbit.retry.RejectAndDontRequeueRecoverer()).build());
        return factory;
    }

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
