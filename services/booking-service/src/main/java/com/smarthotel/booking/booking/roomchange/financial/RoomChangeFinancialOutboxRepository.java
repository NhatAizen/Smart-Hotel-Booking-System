package com.smarthotel.booking.booking.roomchange.financial;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface RoomChangeFinancialOutboxRepository
        extends JpaRepository<RoomChangeFinancialOutboxEvent, UUID> {

    @Query(value = """
            SELECT candidate.*
            FROM room_change_financial_outbox candidate
            WHERE candidate.status = 'PENDING'
              AND candidate.next_attempt_at <= CURRENT_TIMESTAMP
              AND NOT EXISTS (
                    SELECT 1
                    FROM room_change_financial_outbox predecessor
                    WHERE predecessor.booking_id = candidate.booking_id
                      AND predecessor.room_change_version < candidate.room_change_version
                      AND predecessor.status <> 'PUBLISHED'
            )
            ORDER BY candidate.created_at, candidate.booking_id, candidate.room_change_version
            LIMIT 20
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<RoomChangeFinancialOutboxEvent> lockNextBatch();
}
