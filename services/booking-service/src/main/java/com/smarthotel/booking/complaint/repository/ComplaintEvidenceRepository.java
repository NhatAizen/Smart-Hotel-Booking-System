package com.smarthotel.booking.complaint.repository;

import com.smarthotel.booking.complaint.entity.ComplaintEvidence;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ComplaintEvidenceRepository extends JpaRepository<ComplaintEvidence, UUID> {
    List<ComplaintEvidence> findAllByComplaintIdOrderByCreatedAtAsc(UUID complaintId);
    Optional<ComplaintEvidence> findByIdAndComplaintId(UUID id, UUID complaintId);
    long countByComplaintId(UUID complaintId);
}
