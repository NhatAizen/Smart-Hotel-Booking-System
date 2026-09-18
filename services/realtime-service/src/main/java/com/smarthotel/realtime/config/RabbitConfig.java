package com.smarthotel.realtime.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.retry.RepublishMessageRecoverer;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.boot.autoconfigure.amqp.SimpleRabbitListenerContainerFactoryConfigurer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.retry.interceptor.RetryOperationsInterceptor;

@Configuration
public class RabbitConfig {

    @Bean
    public TopicExchange realtimeExchange(@Value("${app.realtime.exchange:enziurooms.events}") String name) {
        return new TopicExchange(name, true, false);
    }

    @Bean
    public Queue realtimeQueue(@Value("${app.realtime.queue:enziurooms.realtime}") String name) {
        // Keep the original queue arguments so an existing durable queue can be
        // redeclared without RabbitMQ PRECONDITION_FAILED after an upgrade.
        return new Queue(name, true, false, false);
    }

    @Bean
    public Binding realtimeBinding(
            @Qualifier("realtimeQueue") Queue realtimeQueue,
            TopicExchange realtimeExchange
    ) {
        return BindingBuilder.bind(realtimeQueue).to(realtimeExchange).with("#");
    }

    @Bean
    public DirectExchange realtimeDeadLetterExchange(
            @Value("${app.realtime.queue:enziurooms.realtime}") String queueName
    ) {
        return new DirectExchange(queueName + ".dlx", true, false);
    }

    @Bean
    public Queue realtimeDeadLetterQueue(
            @Value("${app.realtime.queue:enziurooms.realtime}") String queueName
    ) {
        return new Queue(queueName + ".dlq", true, false, false);
    }

    @Bean
    public Binding realtimeDeadLetterBinding(
            @Qualifier("realtimeDeadLetterQueue") Queue deadLetterQueue,
            DirectExchange realtimeDeadLetterExchange,
            @Value("${app.realtime.queue:enziurooms.realtime}") String queueName
    ) {
        return BindingBuilder.bind(deadLetterQueue)
                .to(realtimeDeadLetterExchange)
                .with(queueName + ".dead");
    }

    @Bean
    public MessageConverter realtimeJsonMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }

    @Bean
    public RetryOperationsInterceptor realtimeRetryInterceptor(
            RabbitTemplate rabbitTemplate,
            @Value("${app.realtime.queue:enziurooms.realtime}") String queueName
    ) {
        RepublishMessageRecoverer recoverer = new RepublishMessageRecoverer(
                rabbitTemplate,
                queueName + ".dlx",
                queueName + ".dead"
        );
        return RetryInterceptorBuilder.stateless()
                .maxAttempts(3)
                .backOffOptions(500, 2.0, 2_000)
                .recoverer(recoverer)
                .build();
    }

    @Bean(name = "rabbitListenerContainerFactory")
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            SimpleRabbitListenerContainerFactoryConfigurer configurer,
            ConnectionFactory connectionFactory,
            RetryOperationsInterceptor realtimeRetryInterceptor
    ) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        configurer.configure(factory, connectionFactory);
        factory.setAdviceChain(realtimeRetryInterceptor);
        factory.setDefaultRequeueRejected(false);
        return factory;
    }
}
