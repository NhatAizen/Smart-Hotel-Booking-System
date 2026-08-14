package com.smarthotel.identity.rolechange.repository;

import com.smarthotel.identity.rolechange.entity.PartnerDeactivationRequest;
import com.smarthotel.identity.rolechange.entity.PartnerDeactivationStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PartnerDeactivationRequestRepository
        extends JpaRepository<PartnerDeactivationRequest, UUID> {

    boolean existsByUserIdAndStatus(
            UUID userId,
            PartnerDeactivationStatus status
    );

    Optional<PartnerDeactivationRequest> findFirstByUserIdOrderByRequestedAtDesc(
            UUID userId
    );

    List<PartnerDeactivationRequest> findAllByStatusOrderByRequestedAtAsc(
            PartnerDeactivationStatus status
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select request from PartnerDeactivationRequest request where request.id = :id")
    Optional<PartnerDeactivationRequest> findByIdForUpdate(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select request
            from PartnerDeactivationRequest request
            where request.userId = :userId and request.status = :status
            """)
    Optional<PartnerDeactivationRequest> findByUserIdAndStatusForUpdate(
            @Param("userId") UUID userId,
            @Param("status") PartnerDeactivationStatus status
    );
}
