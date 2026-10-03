package com.smarthotel.payment.wallet.repository;

import com.smarthotel.payment.wallet.entity.WalletTransaction;
import com.smarthotel.payment.wallet.entity.WalletTransactionType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {
    List<WalletTransaction> findAllByWalletIdOrderByCreatedAtDesc(UUID walletId);
    boolean existsByPaymentIdAndType(UUID paymentId, WalletTransactionType type);
    boolean existsByPaymentOrderIdAndType(UUID paymentOrderId, WalletTransactionType type);
    List<WalletTransaction> findAllByTransferIdOrderByCreatedAtAsc(UUID transferId);
    Page<WalletTransaction> findAllByWalletId(UUID walletId, Pageable pageable);
    boolean existsByIdempotencyKey(String idempotencyKey);
}
