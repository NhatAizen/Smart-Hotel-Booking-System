package com.smarthotel.notification.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RealtimeRabbitConfig {
    @Bean
    public TopicExchange enziuRealtimeExchange() {
        return new TopicExchange("enziurooms.events", true, false);
    }

    @Bean
    public MessageConverter enziuRealtimeMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }
}
