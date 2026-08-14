package com.smarthotel.identity.partnerrequest.repository;

import com.smarthotel.identity.partnerrequest.entity.PartnerRequest;
import com.smarthotel.identity.partnerrequest.entity.PartnerRequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PartnerRequestRepository extends JpaRepository<PartnerRequest, UUID> {

    Optional<PartnerRequest> findFirstByUserIdOrderByCreatedAtDescIdDesc(UUID userId);

    boolean existsByUserIdAndStatus(UUID userId, PartnerRequestStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select request from PartnerRequest request where request.id = :id")
    Optional<PartnerRequest> findByIdForUpdate(@Param("id") UUID id);

    @Query("select request.userId from PartnerRequest request where request.id = :id")
    Optional<UUID> findUserIdById(@Param("id") UUID id);

    boolean existsByIdentityNumberAndUserIdNot(String identityNumber, UUID userId);

    List<PartnerRequest> findAllByStatusOrderByCreatedAtAsc(PartnerRequestStatus status);
}
