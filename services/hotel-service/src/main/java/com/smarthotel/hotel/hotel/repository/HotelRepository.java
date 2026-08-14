package com.smarthotel.hotel.hotel.repository;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.entity.HotelApprovalStatus;
import com.smarthotel.hotel.hotel.entity.HotelStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HotelRepository extends JpaRepository<Hotel, UUID> {

    List<Hotel> findAllByStatusAndApprovalStatusOrderByCreatedAtDesc(
            HotelStatus status,
            HotelApprovalStatus approvalStatus
    );

    List<Hotel> findAllByCityContainingIgnoreCaseAndStatusAndApprovalStatusOrderByCreatedAtDesc(
            String city,
            HotelStatus status,
            HotelApprovalStatus approvalStatus
    );

    Optional<Hotel> findByIdAndStatusAndApprovalStatus(
            UUID id,
            HotelStatus status,
            HotelApprovalStatus approvalStatus
    );

    List<Hotel> findAllByOwnerIdAndStatusOrderByCreatedAtDesc(UUID ownerId, HotelStatus status);

    List<Hotel> findAllByOwnerIdOrderByCreatedAtDesc(UUID ownerId);

    List<Hotel> findAllByApprovalStatusOrderByCreatedAtAsc(
            HotelApprovalStatus approvalStatus
    );
    @Query("""
            select h from Hotel h
            where (h.latitude is null or h.longitude is null)
              and h.geocodingAttemptedAt is null
            order by h.createdAt asc
            """)
    List<Hotel> findAllMissingCoordinatesNeverGeocoded();

}
