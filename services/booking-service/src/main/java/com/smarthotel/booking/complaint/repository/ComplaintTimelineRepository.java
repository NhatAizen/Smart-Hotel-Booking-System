package com.smarthotel.booking.complaint.repository;

import com.smarthotel.booking.complaint.entity.ComplaintTimelineEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ComplaintTimelineRepository extends JpaRepository<ComplaintTimelineEntry, UUID> {
    List<ComplaintTimelineEntry> findAllByComplaintIdOrderByCreatedAtAsc(UUID complaintId);
    List<ComplaintTimelineEntry> findAllByComplaintIdAndVisibleToCustomerTrueOrderByCreatedAtAsc(UUID complaintId);
}
