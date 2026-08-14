package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.payment.entity.PaymentOrderStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoleChangePaymentFinalityGuardTest {

    private final RoleChangePaymentFinalityGuard guard =
            new RoleChangePaymentFinalityGuard();

    @Test
    void acceptsOnlyOpenOrAlreadyPaidOrders() {
        assertThatCode(() -> guard.ensureCanProcessPaidWebhook(
                PaymentOrderStatus.PENDING
        )).doesNotThrowAnyException();
        assertThatCode(() -> guard.ensureCanProcessPaidWebhook(
                PaymentOrderStatus.PROCESSING
        )).doesNotThrowAnyException();
        assertThatCode(() -> guard.ensureCanProcessPaidWebhook(
                PaymentOrderStatus.PAID
        )).doesNotThrowAnyException();
    }

    @Test
    void delayedWebhookCannotReviveTerminalOrders() {
        for (PaymentOrderStatus status : new PaymentOrderStatus[] {
                PaymentOrderStatus.CANCELLED,
                PaymentOrderStatus.EXPIRED,
                PaymentOrderStatus.FAILED,
                PaymentOrderStatus.REFUNDED
        }) {
            assertThatThrownBy(() -> guard.ensureCanProcessPaidWebhook(status))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining(status.name());
        }
    }
}
