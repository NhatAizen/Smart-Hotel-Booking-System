package com.smarthotel.payment.wallet.repository;

import com.smarthotel.payment.wallet.entity.WalletTransaction;
import com.smarthotel.payment.wallet.entity.WalletTransactionType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {
    List<WalletTransaction> findAllByWalletIdOrderByCreatedAtDesc(UUID walletId);
    boolean existsByPaymentIdAndType(UUID paymentId, WalletTransactionType type);
    boolean existsByPaymentOrderIdAndType(UUID paymentOrderId, WalletTransactionType type);
}
