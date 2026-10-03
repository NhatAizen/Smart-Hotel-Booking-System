package com.smarthotel.payment.wallet.roomchange;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.UUID;

public interface RoomChangeResultOutboxRepository extends JpaRepository<RoomChangeResultOutbox, UUID> {
    @Query(value = "SELECT * FROM room_change_result_outbox WHERE status = 'PENDING' "
            + "AND next_attempt_at <= CURRENT_TIMESTAMP ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED", nativeQuery = true)
    List<RoomChangeResultOutbox> lockNextBatch();
}
