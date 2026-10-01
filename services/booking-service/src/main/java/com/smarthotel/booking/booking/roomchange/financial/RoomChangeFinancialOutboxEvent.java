package com.smarthotel.booking.booking.roomchange.financial;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Entity
@Table(name = "room_change_financial_outbox")
public class RoomChangeFinancialOutboxEvent {
    protected RoomChangeFinancialOutboxEvent() {}

    @Id
    @Column(name = "event_id", nullable = false, updatable = false)
    private UUID eventId;
    @Column(name = "room_change_id", nullable = false, updatable = false)
    private UUID roomChangeId;
    @Column(name = "booking_id", nullable = false, updatable = false)
    private UUID bookingId;
    @Column(name = "customer_id", nullable = false, updatable = false)
    private UUID customerId;
    @Column(name = "new_booking_total", nullable = false, precision = 16, scale = 2, updatable = false)
    private BigDecimal newBookingTotal;
    @Column(name = "expected_net_retained_amount", nullable = false, precision = 16, scale = 2, updatable = false)
    private BigDecimal expectedNetRetainedAmount;
    @Column(name = "room_change_version", nullable = false, updatable = false)
    private long roomChangeVersion;
    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;
    @Column(name = "correlation_id", length = 160, updatable = false)
    private String correlationId;
    @Column(nullable = false, length = 20)
    private String status;
    @Column(name = "publish_attempts", nullable = false)
    private int publishAttempts;
    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;
    @Column(name = "published_at")
    private Instant publishedAt;
    @Column(name = "last_error", length = 1000)
    private String lastError;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public RoomChangeFinancialOutboxEvent(
            UUID roomChangeId,
            UUID bookingId,
            UUID customerId,
            BigDecimal newBookingTotal,
            BigDecimal expectedNetRetainedAmount,
            long roomChangeVersion,
            Instant occurredAt,
            String correlationId
    ) {
        if (roomChangeVersion <= 0) {
            throw new IllegalArgumentException("roomChangeVersion phải lớn hơn 0");
        }
        Instant now = Instant.now();
        this.eventId = roomChangeId;
        this.roomChangeId = roomChangeId;
        this.bookingId = bookingId;
        this.customerId = customerId;
        this.newBookingTotal = newBookingTotal.setScale(0, RoundingMode.HALF_UP);
        this.expectedNetRetainedAmount = expectedNetRetainedAmount
                .setScale(0, RoundingMode.HALF_UP);
        if (this.expectedNetRetainedAmount.signum() < 0) {
            throw new IllegalArgumentException("expectedNetRetainedAmount không được âm");
        }
        this.roomChangeVersion = roomChangeVersion;
        this.occurredAt = occurredAt == null ? now : occurredAt;
        this.correlationId = clean(correlationId);
        this.status = "PENDING";
        this.publishAttempts = 0;
        this.nextAttemptAt = now;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void markPublished() {
        Instant now = Instant.now();
        this.status = "PUBLISHED";
        this.publishedAt = now;
        this.lastError = null;
        this.updatedAt = now;
    }

    public void scheduleRetry(String error) {
        this.publishAttempts++;
        long delaySeconds = Math.min(300, 1L << Math.min(8, publishAttempts));
        Instant now = Instant.now();
        this.nextAttemptAt = now.plus(delaySeconds, ChronoUnit.SECONDS);
        this.lastError = abbreviate(error, 1000);
        this.updatedAt = now;
    }

    private static String clean(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static String abbreviate(String value, int max) {
        String normalized = clean(value);
        if (normalized == null || normalized.length() <= max) return normalized;
        return normalized.substring(0, max);
    }

    public UUID getEventId() { return eventId; }
    public UUID getRoomChangeId() { return roomChangeId; }
    public UUID getBookingId() { return bookingId; }
    public UUID getCustomerId() { return customerId; }
    public BigDecimal getNewBookingTotal() { return newBookingTotal; }
    public BigDecimal getExpectedNetRetainedAmount() { return expectedNetRetainedAmount; }
    public long getRoomChangeVersion() { return roomChangeVersion; }
    public Instant getOccurredAt() { return occurredAt; }
    public String getCorrelationId() { return correlationId; }
    public String getStatus() { return status; }
    public int getPublishAttempts() { return publishAttempts; }
    public Instant getNextAttemptAt() { return nextAttemptAt; }
    public Instant getPublishedAt() { return publishedAt; }
    public String getLastError() { return lastError; }
}
