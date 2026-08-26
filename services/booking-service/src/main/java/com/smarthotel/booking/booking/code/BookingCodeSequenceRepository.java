package com.smarthotel.booking.booking.code;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface BookingCodeSequenceRepository extends JpaRepository<BookingCodeSequence, UUID> {

    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO booking_code_sequences (hotel_id, prefix, last_number)
            VALUES (:hotelId, :prefix, 0)
            ON CONFLICT (hotel_id) DO NOTHING
            """, nativeQuery = true)
    int initializeIfMissing(
            @Param("hotelId") UUID hotelId,
            @Param("prefix") String prefix
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT sequence FROM BookingCodeSequence sequence WHERE sequence.hotelId = :hotelId")
    Optional<BookingCodeSequence> findForUpdate(@Param("hotelId") UUID hotelId);
}
