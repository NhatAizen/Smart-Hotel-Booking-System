package com.smarthotel.payment.wallet.repository;

import com.smarthotel.payment.wallet.entity.HotelAdminDemotionFence;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface HotelAdminDemotionFenceRepository
        extends JpaRepository<HotelAdminDemotionFence, UUID> {

    @Modifying
    @Query(value = """
            INSERT INTO hotel_admin_demotion_fences (
                owner_id,
                transition_id,
                created_at,
                updated_at
            )
            VALUES (:ownerId, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (owner_id) DO NOTHING
            """, nativeQuery = true)
    int ensureOwnerRow(@Param("ownerId") UUID ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select fence
            from HotelAdminDemotionFence fence
            where fence.ownerId = :ownerId
            """)
    Optional<HotelAdminDemotionFence> findForUpdate(@Param("ownerId") UUID ownerId);
}
