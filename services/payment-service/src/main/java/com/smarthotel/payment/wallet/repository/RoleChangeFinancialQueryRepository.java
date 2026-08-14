package com.smarthotel.payment.wallet.repository;

import com.smarthotel.payment.payment.entity.PaymentOrderStatus;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.entity.PaymentType;
import com.smarthotel.payment.wallet.entity.WithdrawalStatus;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public class RoleChangeFinancialQueryRepository {

    private static final List<WithdrawalStatus> OPEN_WITHDRAWAL_STATUSES = List.of(
            WithdrawalStatus.PENDING,
            WithdrawalStatus.APPROVED,
            WithdrawalStatus.PROCESSING
    );
    private static final List<PaymentOrderStatus> OPEN_PAYMENT_ORDER_STATUSES = List.of(
            PaymentOrderStatus.PENDING,
            PaymentOrderStatus.PROCESSING
    );

    private final EntityManager entityManager;

    public RoleChangeFinancialQueryRepository(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public long countOpenWithdrawals(UUID ownerId) {
        return entityManager.createQuery("""
                        SELECT COUNT(withdrawal)
                        FROM WithdrawalRequest withdrawal
                        WHERE withdrawal.ownerId = :ownerId
                          AND withdrawal.status IN :statuses
                        """, Long.class)
                .setParameter("ownerId", ownerId)
                .setParameter("statuses", OPEN_WITHDRAWAL_STATUSES)
                .getSingleResult();
    }

    public long countPendingPayments(UUID ownerId) {
        return entityManager.createQuery("""
                        SELECT COUNT(payment)
                        FROM Payment payment
                        WHERE payment.hotelOwnerId = :ownerId
                          AND payment.status = :status
                        """, Long.class)
                .setParameter("ownerId", ownerId)
                .setParameter("status", PaymentStatus.PENDING)
                .getSingleResult();
    }

    public long countUnsettledPaidPayments(UUID ownerId) {
        return entityManager.createQuery("""
                        SELECT COUNT(payment)
                        FROM Payment payment
                        WHERE payment.hotelOwnerId = :ownerId
                          AND payment.status = :status
                          AND (
                                payment.bookingApplied = false
                                OR payment.walletApplied = false
                                OR payment.revenueReleased = false
                          )
                        """, Long.class)
                .setParameter("ownerId", ownerId)
                .setParameter("status", PaymentStatus.PAID)
                .getSingleResult();
    }

    public long countOpenWalletTopUps(UUID ownerId) {
        return entityManager.createQuery("""
                        SELECT COUNT(paymentOrder)
                        FROM PaymentOrder paymentOrder
                        WHERE paymentOrder.customerId = :ownerId
                          AND paymentOrder.paymentType = :paymentType
                          AND paymentOrder.status IN :statuses
                        """, Long.class)
                .setParameter("ownerId", ownerId)
                .setParameter("paymentType", PaymentType.WALLET_TOP_UP)
                .setParameter("statuses", OPEN_PAYMENT_ORDER_STATUSES)
                .getSingleResult();
    }
}
