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
    private final RoomChangeReconciliationService reconciliationService;
    private final RoomChangeFinancialMessageVerifier messageVerifier;

    public RoomChangeFinancialCommandListener(
            ObjectMapper objectMapper,
            RoomChangeReconciliationService reconciliationService,
            RoomChangeFinancialMessageVerifier messageVerifier
    ) {
        this.objectMapper = objectMapper;
        this.reconciliationService = reconciliationService;
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
        try {
            reconciliationService.settle(command);
        } catch (IllegalStateException failure) {
            String reason = failure.getMessage();
            if (reason != null && (reason.startsWith("ROOM_CHANGE_RECONCILIATION_REQUIRED:")
                    || reason.startsWith("Customer không sở hữu settled payment")
                    || reason.startsWith("STALE_FINANCIAL_OPERATION:"))) {
                reconciliationService.reconciliationRequired(command);
            } else {
                // Transient visibility/version gaps, infrastructure failures and
                // invalid/reused payloads retain retry/DLQ semantics, never a success ACK.
                throw failure;
            }
        }
    }
}
