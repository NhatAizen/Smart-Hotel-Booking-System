package com.smarthotel.payment.wallet.roomchange;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "room_change_result_outbox", uniqueConstraints =
        @UniqueConstraint(name = "uq_room_change_result_booking_version", columnNames = {"booking_id", "room_change_version"}))
public class RoomChangeResultOutbox {
    protected RoomChangeResultOutbox() {}
    @Id @Column(name = "event_id", nullable = false) private UUID eventId;
    @Column(name = "booking_id", nullable = false) private UUID bookingId;
    @Column(name = "room_change_version", nullable = false) private long roomChangeVersion;
    @Column(name = "command_payload", nullable = false, columnDefinition = "TEXT") private String commandPayload;
    @Column(name = "result_payload", nullable = false, columnDefinition = "TEXT") private String resultPayload;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "publish_attempts", nullable = false) private int publishAttempts;
    @Column(name = "next_attempt_at", nullable = false) private Instant nextAttemptAt;
    @Column(name = "last_error", length = 1000) private String lastError;
    @Column(name = "published_at") private Instant publishedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    public RoomChangeResultOutbox(RoomChangeFinancialCommand command, String commandPayload, String resultPayload) {
        eventId = command.eventId(); bookingId = command.bookingId();
        roomChangeVersion = command.roomChangeVersion(); this.commandPayload = commandPayload;
        this.resultPayload = resultPayload; status = "PENDING";
        createdAt = Instant.now(); nextAttemptAt = createdAt;
    }
    public void published() { status = "PUBLISHED"; publishedAt = Instant.now(); lastError = null; }
    public void retry(String error) {
        publishAttempts++;
        nextAttemptAt = Instant.now().plusSeconds(Math.min(300, 1L << Math.min(8, publishAttempts)));
        lastError = error == null ? "Publish failed" : error.substring(0, Math.min(error.length(), 1000));
    }
    public UUID getEventId() { return eventId; }
    public String getCommandPayload() { return commandPayload; }
    public String getResultPayload() { return resultPayload; }
    public String getStatus() { return status; }
    public int getPublishAttempts() { return publishAttempts; }
}
