package com.smarthotel.booking.complaint.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "complaint_evidence")
public class ComplaintEvidence {
    @Id @Column(nullable = false, updatable = false) private UUID id;
    @Column(name = "complaint_id", nullable = false) private UUID complaintId;
    @Column(name = "uploaded_by", nullable = false) private UUID uploadedBy;
    @Enumerated(EnumType.STRING)
    @Column(name = "uploader_role", nullable = false, length = 30)
    private ComplaintActorRole uploaderRole;
    @Column(name = "original_file_name", nullable = false, length = 255) private String originalFileName;
    @Column(name = "stored_file_name", nullable = false, unique = true, length = 255) private String storedFileName;
    @Column(name = "content_type", nullable = false, length = 100) private String contentType;
    @Column(name = "file_size", nullable = false) private long fileSize;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;

    protected ComplaintEvidence() {}
    public ComplaintEvidence(UUID complaintId, UUID uploadedBy, ComplaintActorRole uploaderRole,
                             String originalFileName, String storedFileName, String contentType, long fileSize) {
        this.id = UUID.randomUUID();
        this.complaintId = complaintId;
        this.uploadedBy = uploadedBy;
        this.uploaderRole = uploaderRole;
        this.originalFileName = originalFileName;
        this.storedFileName = storedFileName;
        this.contentType = contentType;
        this.fileSize = fileSize;
        this.createdAt = Instant.now();
    }
    public UUID getId() { return id; }
    public UUID getComplaintId() { return complaintId; }
    public UUID getUploadedBy() { return uploadedBy; }
    public ComplaintActorRole getUploaderRole() { return uploaderRole; }
    public String getOriginalFileName() { return originalFileName; }
    public String getStoredFileName() { return storedFileName; }
    public String getContentType() { return contentType; }
    public long getFileSize() { return fileSize; }
    public Instant getCreatedAt() { return createdAt; }
}
