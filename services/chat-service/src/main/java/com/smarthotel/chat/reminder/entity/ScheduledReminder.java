package com.smarthotel.chat.reminder.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "scheduled_chat_reminders",
        uniqueConstraints = @UniqueConstraint(name = "uq_scheduled_chat_reminder_dedupe", columnNames = "dedupe_key")
)
public class ScheduledReminder {

    protected ScheduledReminder() {
    }

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "conversation_id", nullable = false)
    private UUID conversationId;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 40)
    private ReminderType type;

    @Column(name = "scheduled_at", nullable = false)
    private Instant scheduledAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ReminderStatus status;

    @Column(name = "dedupe_key", nullable = false, length = 120)
    private String dedupeKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "sent_at")
    private Instant sentAt;

    public ScheduledReminder(
            UUID conversationId,
            UUID bookingId,
            ReminderType type,
            Instant scheduledAt,
            String dedupeKey
    ) {
        this.id = UUID.randomUUID();
        this.conversationId = conversationId;
        this.bookingId = bookingId;
        this.type = type;
        this.scheduledAt = scheduledAt;
        this.status = ReminderStatus.PENDING;
        this.dedupeKey = dedupeKey;
        this.createdAt = Instant.now();
    }

    public void markSent() {
        this.status = ReminderStatus.SENT;
        this.sentAt = Instant.now();
    }

    public void cancel() {
        this.status = ReminderStatus.CANCELLED;
    }

    public void reschedule(Instant newScheduledAt) {
        this.scheduledAt = newScheduledAt;
        this.status = ReminderStatus.PENDING;
    }

    public UUID getId() { return id; }
    public UUID getConversationId() { return conversationId; }
    public UUID getBookingId() { return bookingId; }
    public ReminderType getType() { return type; }
    public Instant getScheduledAt() { return scheduledAt; }
    public ReminderStatus getStatus() { return status; }
    public String getDedupeKey() { return dedupeKey; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getSentAt() { return sentAt; }
}
