package com.smarthotel.payment.wallet.roomchange;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.retry.RejectAndDontRequeueRecoverer;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;

@Configuration
@ConditionalOnProperty(
        name = "features.room-change-customer-wallet-credit-enabled",
        havingValue = "true"
)
public class RoomChangeFinancialRabbitConfig {
    public static final String EXCHANGE = "enziurooms.financial";
    public static final String ROUTING_KEY = "booking.room-change.credit.requested";
    public static final String QUEUE = "enziurooms.payment.room-change-credit";
    public static final String DEAD_LETTER_EXCHANGE = "enziurooms.financial.dlx";
    public static final String DEAD_LETTER_QUEUE = "enziurooms.payment.room-change-credit.dlq";
    public static final String DEAD_LETTER_ROUTING_KEY = "booking.room-change.credit.failed";

    @Bean
    TopicExchange financialExchange() {
        return new TopicExchange(EXCHANGE, true, false);
    }

    @Bean
    TopicExchange financialDeadLetterExchange() {
        return new TopicExchange(DEAD_LETTER_EXCHANGE, true, false);
    }

    @Bean
    Queue roomChangeCreditQueue() {
        return QueueBuilder.durable(QUEUE)
                .deadLetterExchange(DEAD_LETTER_EXCHANGE)
                .deadLetterRoutingKey(DEAD_LETTER_ROUTING_KEY)
                .build();
    }

    @Bean
    Queue roomChangeCreditDeadLetterQueue() {
        return QueueBuilder.durable(DEAD_LETTER_QUEUE).build();
    }

    @Bean
    Binding roomChangeCreditBinding(Queue roomChangeCreditQueue, TopicExchange financialExchange) {
        return BindingBuilder.bind(roomChangeCreditQueue).to(financialExchange).with(ROUTING_KEY);
    }

    @Bean
    Binding roomChangeCreditDeadLetterBinding(
            Queue roomChangeCreditDeadLetterQueue,
            TopicExchange financialDeadLetterExchange
    ) {
        return BindingBuilder.bind(roomChangeCreditDeadLetterQueue)
                .to(financialDeadLetterExchange)
                .with(DEAD_LETTER_ROUTING_KEY);
    }

    @Bean(name = "roomChangeFinancialListenerContainerFactory")
    SimpleRabbitListenerContainerFactory roomChangeFinancialListenerContainerFactory(
            ConnectionFactory connectionFactory
    ) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setDefaultRequeueRejected(false);
        factory.setAdviceChain(RetryInterceptorBuilder.stateless()
                .maxAttempts(5)
                .backOffOptions(1000, 2.0, 10000)
                // After retries, reject once and let RabbitMQ dead-letter the
                // original persistent message atomically at the broker.
                .recoverer(new RejectAndDontRequeueRecoverer())
                .build());
        return factory;
    }
}
