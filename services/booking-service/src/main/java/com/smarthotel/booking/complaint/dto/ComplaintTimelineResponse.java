package com.smarthotel.booking.complaint.dto;

import com.smarthotel.booking.complaint.entity.ComplaintActorRole;
import com.smarthotel.booking.complaint.entity.ComplaintEventType;
import com.smarthotel.booking.complaint.entity.ComplaintStatus;
import com.smarthotel.booking.complaint.entity.ComplaintTimelineEntry;

import java.time.Instant;
import java.util.UUID;

public record ComplaintTimelineResponse(
        UUID id,
        ComplaintEventType eventType,
        UUID actorId,
        ComplaintActorRole actorRole,
        String message,
        ComplaintStatus fromStatus,
        ComplaintStatus toStatus,
        boolean visibleToCustomer,
        Instant createdAt
) {
    public static ComplaintTimelineResponse from(ComplaintTimelineEntry entry) {
        return new ComplaintTimelineResponse(entry.getId(), entry.getEventType(), entry.getActorId(),
                entry.getActorRole(), entry.getMessage(), entry.getFromStatus(), entry.getToStatus(),
                entry.isVisibleToCustomer(), entry.getCreatedAt());
    }
}
