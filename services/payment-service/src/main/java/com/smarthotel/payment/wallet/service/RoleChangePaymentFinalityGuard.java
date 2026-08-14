package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.payment.entity.PaymentOrderStatus;
import org.springframework.stereotype.Component;

@Component
public class RoleChangePaymentFinalityGuard {

    public void ensureCanProcessPaidWebhook(PaymentOrderStatus status) {
        if (status == PaymentOrderStatus.PENDING
                || status == PaymentOrderStatus.PROCESSING
                || status == PaymentOrderStatus.PAID) {
            return;
        }
        throw new IllegalStateException(
                "Không thể hoàn tất lệnh thanh toán đã ở trạng thái " + status
        );
    }
}
