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
@Table(name = "complaint_timeline_entries")
public class ComplaintTimelineEntry {
    @Id @Column(nullable = false, updatable = false) private UUID id;
    @Column(name = "complaint_id", nullable = false) private UUID complaintId;
    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 50) private ComplaintEventType eventType;
    @Column(name = "actor_id") private UUID actorId;
    @Enumerated(EnumType.STRING)
    @Column(name = "actor_role", nullable = false, length = 30) private ComplaintActorRole actorRole;
    @Column(columnDefinition = "TEXT") private String message;
    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 40) private ComplaintStatus fromStatus;
    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", length = 40) private ComplaintStatus toStatus;
    @Column(name = "visible_to_customer", nullable = false) private boolean visibleToCustomer;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;

    protected ComplaintTimelineEntry() {}
    public ComplaintTimelineEntry(UUID complaintId, ComplaintEventType eventType, UUID actorId,
                                  ComplaintActorRole actorRole, String message,
                                  ComplaintStatus fromStatus, ComplaintStatus toStatus,
                                  boolean visibleToCustomer) {
        this.id = UUID.randomUUID();
        this.complaintId = complaintId;
        this.eventType = eventType;
        this.actorId = actorId;
        this.actorRole = actorRole;
        this.message = message == null || message.isBlank() ? null : message.trim();
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.visibleToCustomer = visibleToCustomer;
        this.createdAt = Instant.now();
    }
    public UUID getId() { return id; }
    public UUID getComplaintId() { return complaintId; }
    public ComplaintEventType getEventType() { return eventType; }
    public UUID getActorId() { return actorId; }
    public ComplaintActorRole getActorRole() { return actorRole; }
    public String getMessage() { return message; }
    public ComplaintStatus getFromStatus() { return fromStatus; }
    public ComplaintStatus getToStatus() { return toStatus; }
    public boolean isVisibleToCustomer() { return visibleToCustomer; }
    public Instant getCreatedAt() { return createdAt; }
}
