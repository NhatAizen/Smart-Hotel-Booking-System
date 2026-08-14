package com.smarthotel.identity.rolechange.repository;

import com.smarthotel.identity.partnerrequest.entity.PartnerRequest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * Narrow write-only access to the existing partner application lifecycle.
 * It deliberately exposes no generic status mutation.
 */
public interface RoleChangePartnerRequestRepository
        extends Repository<PartnerRequest, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select request
            from PartnerRequest request
            where request.userId = :userId
              and request.status = com.smarthotel.identity.partnerrequest.entity.PartnerRequestStatus.PENDING
            """)
    List<PartnerRequest> lockPendingForUser(@Param("userId") UUID userId);

    @Modifying(flushAutomatically = true)
    @Query(value = """
            UPDATE partner_requests
            SET status = 'REJECTED',
                rejection_reason = :reason,
                reviewed_by = :actorId,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = :userId
              AND status = 'PENDING'
            """, nativeQuery = true)
    int supersedePendingAfterPromotion(
            @Param("userId") UUID userId,
            @Param("actorId") UUID actorId,
            @Param("reason") String reason
    );
}
