package com.smarthotel.realtime.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {

    @Bean
    public TopicExchange realtimeExchange(@Value("${app.realtime.exchange:enziurooms.events}") String name) {
        return new TopicExchange(name, true, false);
    }

    @Bean
    public Queue realtimeQueue(@Value("${app.realtime.queue:enziurooms.realtime}") String name) {
        return new Queue(name, true, false, false);
    }

    @Bean
    public Binding realtimeBinding(Queue realtimeQueue, TopicExchange realtimeExchange) {
        return BindingBuilder.bind(realtimeQueue).to(realtimeExchange).with("#");
    }

    @Bean
    public MessageConverter realtimeJsonMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }
}
