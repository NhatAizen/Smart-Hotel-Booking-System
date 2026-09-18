package com.smarthotel.booking.complaint.dto;

import com.smarthotel.booking.complaint.entity.ComplaintActorRole;
import com.smarthotel.booking.complaint.entity.ComplaintEvidence;

import java.time.Instant;
import java.util.UUID;

public record ComplaintEvidenceResponse(
        UUID id,
        UUID uploadedBy,
        ComplaintActorRole uploaderRole,
        String fileName,
        String contentType,
        long fileSize,
        String contentUrl,
        Instant createdAt
) {
    public static ComplaintEvidenceResponse from(ComplaintEvidence evidence) {
        return new ComplaintEvidenceResponse(
                evidence.getId(), evidence.getUploadedBy(), evidence.getUploaderRole(),
                evidence.getOriginalFileName(), evidence.getContentType(), evidence.getFileSize(),
                "/api/complaints/" + evidence.getComplaintId() + "/evidence/" + evidence.getId() + "/content",
                evidence.getCreatedAt()
        );
    }
}
