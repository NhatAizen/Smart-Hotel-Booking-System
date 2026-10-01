package com.smarthotel.payment.wallet.roomchange;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
        name = "features.room-change-customer-wallet-credit-enabled",
        havingValue = "true"
)
public class RoomChangeFinancialCommandListener {
    private final ObjectMapper objectMapper;
    private final RoomChangeCreditService creditService;
    private final RoomChangeFinancialMessageVerifier messageVerifier;

    public RoomChangeFinancialCommandListener(
            ObjectMapper objectMapper,
            RoomChangeCreditService creditService,
            RoomChangeFinancialMessageVerifier messageVerifier
    ) {
        this.objectMapper = objectMapper;
        this.creditService = creditService;
        this.messageVerifier = messageVerifier;
    }

    @RabbitListener(
            queues = RoomChangeFinancialRabbitConfig.QUEUE,
            containerFactory = "roomChangeFinancialListenerContainerFactory"
    )
    public void receive(Message message) throws Exception {
        byte[] payload = message.getBody();
        Object signature = message.getMessageProperties().getHeaders().get(
                "X-Enziu-Financial-Signature"
        );
        messageVerifier.verify(payload, signature == null ? null : signature.toString());
        RoomChangeFinancialCommand command = objectMapper.readValue(
                payload, RoomChangeFinancialCommand.class
        );
        creditService.process(command);
    }
}
