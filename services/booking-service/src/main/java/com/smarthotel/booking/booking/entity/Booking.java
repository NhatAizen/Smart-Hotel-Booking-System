package com.smarthotel.booking.booking.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Getter
@Entity
@Table(name = "bookings")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Booking {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "hotel_id", nullable = false)
    private UUID hotelId;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Column(name = "check_in", nullable = false)
    private LocalDate checkIn;

    @Column(name = "check_out", nullable = false)
    private LocalDate checkOut;

    @Column(name = "guest_count", nullable = false)
    private Integer guestCount;

    @Column(name = "total_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalPrice;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private BookingStatus status;

    @Column(name = "special_request", length = 1000)
    private String specialRequest;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Booking(
            UUID customerId,
            UUID hotelId,
            UUID roomId,
            LocalDate checkIn,
            LocalDate checkOut,
            Integer guestCount,
            BigDecimal totalPrice,
            String specialRequest
    ) {
        Instant now = Instant.now();

        this.id = UUID.randomUUID();
        this.customerId = customerId;
        this.hotelId = hotelId;
        this.roomId = roomId;
        this.checkIn = checkIn;
        this.checkOut = checkOut;
        this.guestCount = guestCount;
        this.totalPrice = totalPrice;
        this.status = BookingStatus.PENDING;
        this.specialRequest = specialRequest;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void confirm() {
        ensureStatus(BookingStatus.PENDING);
        this.status = BookingStatus.CONFIRMED;
        this.updatedAt = Instant.now();
    }

    public void checkIn() {
        ensureStatus(BookingStatus.CONFIRMED);
        this.status = BookingStatus.CHECKED_IN;
        this.updatedAt = Instant.now();
    }

    public void checkOut() {
        ensureStatus(BookingStatus.CHECKED_IN);
        this.status = BookingStatus.CHECKED_OUT;
        this.updatedAt = Instant.now();
    }

    public void cancel() {
        if (status == BookingStatus.CANCELLED) {
            return;
        }

        if (status == BookingStatus.CHECKED_IN
                || status == BookingStatus.CHECKED_OUT) {
            throw new IllegalStateException(
                    "KhÃ´ng thá»ƒ há»§y booking Ä‘Ã£ nháº­n phÃ²ng hoáº·c tráº£ phÃ²ng"
            );
        }

        this.status = BookingStatus.CANCELLED;
        this.cancelledAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    private void ensureStatus(BookingStatus expected) {
        if (status != expected) {
            throw new IllegalStateException(
                    "Tráº¡ng thÃ¡i booking khÃ´ng há»£p lá»‡. Cáº§n "
                            + expected
                            + " nhÆ°ng hiá»‡n táº¡i lÃ  "
                            + status
            );
        }
    }
}