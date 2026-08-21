package com.smarthotel.chat.conversation.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "chat_conversations")
public class ChatConversation {

    protected ChatConversation() {
    }

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "booking_id", updatable = false)
    private UUID bookingId;

    @Column(name = "booking_code", length = 40)
    private String bookingCode;

    @Column(name = "hotel_id", nullable = false, updatable = false)
    private UUID hotelId;

    @Column(name = "customer_id", nullable = false, updatable = false)
    private UUID customerId;

    @Column(name = "hotel_admin_id", nullable = false)
    private UUID hotelAdminId;

    @Column(name = "hotel_name", nullable = false, length = 150)
    private String hotelName;

    @Column(name = "check_in")
    private LocalDate checkIn;

    @Column(name = "check_out")
    private LocalDate checkOut;

    @Column(name = "check_in_time", nullable = false)
    private LocalTime checkInTime;

    @Column(name = "check_out_time", nullable = false)
    private LocalTime checkOutTime;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ConversationStatus status;

    @Column(name = "auto_reply_enabled", nullable = false)
    private boolean autoReplyEnabled;

    @Column(name = "human_takeover", nullable = false)
    private boolean humanTakeover;

    @Enumerated(EnumType.STRING)
    @Column(name = "arrival_status", nullable = false, length = 30)
    private ArrivalStatus arrivalStatus;

    @Column(name = "expected_arrival_time")
    private LocalTime expectedArrivalTime;

    @Column(name = "last_message_at", nullable = false)
    private Instant lastMessageAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public ChatConversation(
            UUID bookingId,
            String bookingCode,
            UUID hotelId,
            UUID customerId,
            UUID hotelAdminId,
            String hotelName,
            LocalDate checkIn,
            LocalDate checkOut,
            LocalTime checkInTime,
            LocalTime checkOutTime
    ) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.bookingId = bookingId;
        this.bookingCode = bookingCode;
        this.hotelId = hotelId;
        this.customerId = customerId;
        this.hotelAdminId = hotelAdminId;
        this.hotelName = hotelName == null || hotelName.isBlank() ? "Khách sạn" : hotelName.trim();
        this.checkIn = checkIn;
        this.checkOut = checkOut;
        this.checkInTime = checkInTime == null ? LocalTime.of(14, 0) : checkInTime;
        this.checkOutTime = checkOutTime == null ? LocalTime.NOON : checkOutTime;
        this.status = ConversationStatus.OPEN;
        this.autoReplyEnabled = true;
        this.humanTakeover = false;
        this.arrivalStatus = ArrivalStatus.UNKNOWN;
        this.expectedArrivalTime = null;
        this.lastMessageAt = now;
        this.createdAt = now;
        this.updatedAt = now;
    }


    public ChatConversation(
            UUID hotelId,
            UUID customerId,
            UUID hotelAdminId,
            String hotelName,
            LocalTime checkInTime,
            LocalTime checkOutTime
    ) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.bookingId = null;
        this.bookingCode = null;
        this.hotelId = hotelId;
        this.customerId = customerId;
        this.hotelAdminId = hotelAdminId;
        this.hotelName = hotelName == null || hotelName.isBlank() ? "Khách sạn" : hotelName.trim();
        this.checkIn = null;
        this.checkOut = null;
        this.checkInTime = checkInTime == null ? LocalTime.of(14, 0) : checkInTime;
        this.checkOutTime = checkOutTime == null ? LocalTime.NOON : checkOutTime;
        this.status = ConversationStatus.OPEN;
        this.autoReplyEnabled = true;
        this.humanTakeover = false;
        this.arrivalStatus = ArrivalStatus.UNKNOWN;
        this.expectedArrivalTime = null;
        this.lastMessageAt = now;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void touch(Instant when) {
        Instant value = when == null ? Instant.now() : when;
        this.lastMessageAt = value;
        this.updatedAt = value;
    }

    public void setHumanTakeover(boolean humanTakeover) {
        this.humanTakeover = humanTakeover;
        this.updatedAt = Instant.now();
    }

    public void setAutoReplyEnabled(boolean enabled) {
        this.autoReplyEnabled = enabled;
        this.updatedAt = Instant.now();
    }

    public void updateArrival(ArrivalStatus status, LocalTime expectedArrivalTime) {
        this.arrivalStatus = status == null ? ArrivalStatus.UNKNOWN : status;
        this.expectedArrivalTime = expectedArrivalTime;
        this.updatedAt = Instant.now();
    }

    public void markNoShowRisk() {
        if (this.arrivalStatus != ArrivalStatus.ARRIVING_LATE) {
            this.arrivalStatus = ArrivalStatus.NO_SHOW_RISK;
        }
        this.updatedAt = Instant.now();
    }

    public void close() {
        this.status = ConversationStatus.CLOSED;
        this.autoReplyEnabled = false;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getBookingId() { return bookingId; }
    public String getBookingCode() { return bookingCode; }
    public UUID getHotelId() { return hotelId; }
    public UUID getCustomerId() { return customerId; }
    public UUID getHotelAdminId() { return hotelAdminId; }
    public String getHotelName() { return hotelName; }
    public LocalDate getCheckIn() { return checkIn; }
    public LocalDate getCheckOut() { return checkOut; }
    public LocalTime getCheckInTime() { return checkInTime; }
    public LocalTime getCheckOutTime() { return checkOutTime; }
    public ConversationStatus getStatus() { return status; }
    public boolean isAutoReplyEnabled() { return autoReplyEnabled; }
    public boolean isHumanTakeover() { return humanTakeover; }
    public ArrivalStatus getArrivalStatus() { return arrivalStatus; }
    public LocalTime getExpectedArrivalTime() { return expectedArrivalTime; }
    public Instant getLastMessageAt() { return lastMessageAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
