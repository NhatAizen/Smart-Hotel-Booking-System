package com.smarthotel.booking.booking.roomchange.financial;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "features.room-change-customer-wallet-credit-enabled", havingValue = "true")
public class RoomChangeFinancialResultListener {
    private final ObjectMapper mapper;
    private final RoomChangeFinancialMessageSigner signatures;
    private final RoomChangeFinancialResultService results;
    public RoomChangeFinancialResultListener(ObjectMapper mapper, RoomChangeFinancialMessageSigner signatures,
            RoomChangeFinancialResultService results) {
        this.mapper = mapper; this.signatures = signatures; this.results = results;
    }
    @RabbitListener(queues = RoomChangeFinancialRabbitConfig.RESULT_QUEUE,
            containerFactory = "roomChangeResultListenerContainerFactory")
    public void receive(Message message) throws Exception {
        Object signature = message.getMessageProperties().getHeaders().get("X-Enziu-Financial-Signature");
        signatures.verify(message.getBody(), signature == null ? null : signature.toString());
        results.apply(mapper.readValue(message.getBody(), RoomChangeFinancialResult.class));
    }
}
