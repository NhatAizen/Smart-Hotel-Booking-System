package com.smarthotel.booking.booking.code;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "booking_code_sequences")
public class BookingCodeSequence {

    protected BookingCodeSequence() {
    }

    public BookingCodeSequence(UUID hotelId, String prefix) {
        this.hotelId = hotelId;
        this.prefix = prefix;
        this.lastNumber = 0L;
    }

    @Id
    @Column(name = "hotel_id", nullable = false, updatable = false)
    private UUID hotelId;

    @Column(name = "prefix", nullable = false, length = 12)
    private String prefix;

    @Column(name = "last_number", nullable = false)
    private long lastNumber;

    public long nextNumber() {
        this.lastNumber += 1L;
        return this.lastNumber;
    }

    public UUID getHotelId() {
        return hotelId;
    }

    public String getPrefix() {
        return prefix;
    }

    public long getLastNumber() {
        return lastNumber;
    }
}
