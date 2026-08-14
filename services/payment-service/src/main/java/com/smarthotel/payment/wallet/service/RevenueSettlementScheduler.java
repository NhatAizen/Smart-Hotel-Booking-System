package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.integration.booking.BookingClient;
import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class RevenueSettlementScheduler {

    private static final Logger log =
            LoggerFactory.getLogger(RevenueSettlementScheduler.class);

    private final PaymentRepository paymentRepository;
    private final BookingClient bookingClient;
    private final WalletService walletService;

    public RevenueSettlementScheduler(
            PaymentRepository paymentRepository,
            BookingClient bookingClient,
            WalletService walletService
    ) {
        this.paymentRepository = paymentRepository;
        this.bookingClient = bookingClient;
        this.walletService = walletService;
    }

    /**
     * Booking CHECKED_OUT -> tự động release doanh thu online/WALLET.
     * CASH bị bỏ qua vì Hotel đã cầm tiền thật ngoài hệ thống.
     */
    @Scheduled(
            initialDelayString = "${wallet.settlement.initial-delay-ms:10000}",
            fixedDelayString = "${wallet.settlement.scan-delay-ms:15000}"
    )
    public void releaseCheckedOutRevenue() {
        List<Payment> candidates =
                paymentRepository
                        .findAllByStatusAndWalletAppliedTrueAndRevenueReleasedFalseOrderByPaidAtAsc(
                                PaymentStatus.PAID
                        );

        for (Payment payment : candidates) {
            if (payment.getMethod() == PaymentMethod.CASH) {
                continue;
            }

            try {
                var booking = bookingClient.getBooking(payment.getBookingId());
                if (!"CHECKED_OUT".equalsIgnoreCase(booking.status())) {
                    continue;
                }

                walletService.releaseHotelRevenue(payment.getId(), true);
            } catch (RuntimeException exception) {
                log.warn(
                        "Không thể tự giải ngân payment {} booking {}: {}",
                        payment.getId(),
                        payment.getBookingId(),
                        exception.getMessage()
                );
            }
        }
    }
}
