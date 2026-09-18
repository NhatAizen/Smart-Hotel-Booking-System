package com.smarthotel.booking.complaint.repository;

import com.smarthotel.booking.complaint.entity.Complaint;
import com.smarthotel.booking.complaint.entity.ComplaintResolutionType;
import com.smarthotel.booking.complaint.entity.ComplaintStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ComplaintRepository extends JpaRepository<Complaint, UUID> {
    @Query("select c from Complaint c where c.internalTest = false and c.customerId = ?1 order by c.createdAt desc")
    List<Complaint> findAllByCustomerIdOrderByCreatedAtDesc(UUID customerId);
    @Query("select c from Complaint c where c.internalTest = false and c.hotelId in ?1 order by c.createdAt desc")
    List<Complaint> findAllByHotelIdInOrderByCreatedAtDesc(Collection<UUID> hotelIds);
    @Query("select c from Complaint c where c.internalTest = false order by c.createdAt desc")
    List<Complaint> findAllByOrderByCreatedAtDesc();
    @Query("select c from Complaint c where c.internalTest = false and c.status = ?1 order by c.createdAt desc")
    List<Complaint> findAllByStatusOrderByCreatedAtDesc(ComplaintStatus status);
    @Query("select count(c) from Complaint c where c.internalTest = false and c.hotelId = ?1 and c.resolutionType = ?2")
    long countByHotelIdAndResolutionType(UUID hotelId, ComplaintResolutionType resolutionType);
    @Query("select count(c) from Complaint c where c.internalTest = false and c.hotelId = ?1 and c.violationReviewRecommended = true")
    long countByHotelIdAndViolationReviewRecommendedTrue(UUID hotelId);
    @Query("select c from Complaint c where c.internalTest = false and c.escalatedAt is not null order by c.createdAt desc")
    List<Complaint> findAllByEscalatedAtIsNotNullOrderByCreatedAtDesc();
    @Query("select c from Complaint c where c.internalTest = false and c.escalatedAt is not null and c.status = ?1 order by c.createdAt desc")
    List<Complaint> findAllByEscalatedAtIsNotNullAndStatusOrderByCreatedAtDesc(ComplaintStatus status);
}
