package com.smarthotel.hotel.roomtype.repository;

import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.entity.RoomTypeStatus;
import com.smarthotel.hotel.roomtype.entity.RoomTypeApprovalStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoomTypeRepository extends JpaRepository<RoomType, UUID> {
    List<RoomType> findAllByHotelIdOrderByCreatedAtAsc(UUID hotelId);
    List<RoomType> findAllByHotelIdAndStatusAndApprovalStatusOrderByCreatedAtAsc(
            UUID hotelId,
            RoomTypeStatus status,
            RoomTypeApprovalStatus approvalStatus
    );
    List<RoomType> findAllByApprovalStatusOrderBySubmittedAtAsc(RoomTypeApprovalStatus approvalStatus);
    Optional<RoomType> findByIdAndStatus(UUID id, RoomTypeStatus status);
    boolean existsByHotelIdAndNameIgnoreCase(UUID hotelId, String name);
    boolean existsByHotelIdAndNameIgnoreCaseAndIdNot(
            UUID hotelId,
            String name,
            UUID id
    );
    long countByHotelId(UUID hotelId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RoomType r where r.id = :id")
    Optional<RoomType> findForUpdate(@Param("id") UUID id);
}
