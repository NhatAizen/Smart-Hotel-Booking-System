package com.smarthotel.payment.wallet.repository;

import com.smarthotel.payment.wallet.entity.WithdrawalRequest;
import com.smarthotel.payment.wallet.entity.WithdrawalStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WithdrawalRequestRepository extends JpaRepository<WithdrawalRequest, UUID> {
    List<WithdrawalRequest> findAllByOwnerIdOrderByRequestedAtDesc(UUID ownerId);
    List<WithdrawalRequest> findAllByStatusOrderByRequestedAtAsc(WithdrawalStatus status);
    List<WithdrawalRequest> findAllByOrderByRequestedAtDesc();
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from WithdrawalRequest w where w.id = :id")
    Optional<WithdrawalRequest> findForUpdate(@Param("id") UUID id);
}
