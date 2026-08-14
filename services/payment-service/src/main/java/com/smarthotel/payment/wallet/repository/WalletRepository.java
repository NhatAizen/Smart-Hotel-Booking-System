package com.smarthotel.payment.wallet.repository;

import com.smarthotel.payment.wallet.entity.Wallet;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {
    Optional<Wallet> findByOwnerTypeAndOwnerId(WalletOwnerType ownerType, UUID ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from Wallet w where w.ownerType = :type and w.ownerId = :ownerId")
    Optional<Wallet> findForUpdate(@Param("type") WalletOwnerType type, @Param("ownerId") UUID ownerId);
}
