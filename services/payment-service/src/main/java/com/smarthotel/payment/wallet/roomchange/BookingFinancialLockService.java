package com.smarthotel.payment.wallet.roomchange;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Shared database mutex for every financial mutation associated with a booking.
 *
 * <p>Callers must take this lock before a Payment row or any wallet row. That
 * single ordering prevents room-change credit, refund and hotel-revenue release
 * from each validating a stale financial state and then settling the same value
 * concurrently across application replicas.</p>
 *
 * <p>Exact order: PaymentOrder (callback entry, no reverse acquisition), all
 * booking mutexes sorted by UUID, refund/payment/transfer rows, owner demotion
 * fences sorted by UUID, then multi-wallet paths PLATFORM -> HOTEL_ADMIN/HOTEL
 * -> CUSTOMER, then ledger. Checkout prelocks PLATFORM/HOTEL_ADMIN before its
 * CUSTOMER balance check. Single-wallet withdrawal/top-up never subsequently
 * acquires a booking mutex or another wallet.</p>
 */
@Service
public class BookingFinancialLockService {
    private static final int H2_CREATE_RETRIES = 3;

    private final JdbcTemplate jdbcTemplate;

    public BookingFinancialLockService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public long lock(UUID bookingId) {
        if (bookingId == null) {
            throw new IllegalArgumentException("bookingId không được để trống");
        }
        if (isPostgreSql()) {
            jdbcTemplate.update("""
                    INSERT INTO booking_financial_locks (booking_id, created_at)
                    VALUES (?, CURRENT_TIMESTAMP)
                    ON CONFLICT (booking_id) DO NOTHING
                    """, bookingId);
            return selectForUpdate(bookingId);
        }

        // H2's concurrent MERGE can lose the insert race to a transaction that
        // subsequently rolls back (for example, an out-of-order room-change).
        // Retry creation and the locked read as one operation instead of
        // assuming that a caught duplicate leaves a durable row behind.
        for (int attempt = 1; attempt <= H2_CREATE_RETRIES; attempt++) {
            try {
                jdbcTemplate.update("""
                        MERGE INTO booking_financial_locks AS target
                        USING (VALUES (?)) AS source (booking_id)
                        ON target.booking_id = source.booking_id
                        WHEN NOT MATCHED THEN INSERT (booking_id, created_at)
                        VALUES (source.booking_id, CURRENT_TIMESTAMP)
                        """, bookingId);
            } catch (DuplicateKeyException collision) {
                if (attempt == H2_CREATE_RETRIES) {
                    throw collision;
                }
            }
            try {
                return selectForUpdate(bookingId);
            } catch (EmptyResultDataAccessException missingAfterConcurrentRollback) {
                if (attempt == H2_CREATE_RETRIES) {
                    throw missingAfterConcurrentRollback;
                }
            }
        }
        throw new IllegalStateException("Không thể khóa financial state của booking");
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void advanceRoomChangeVersion(UUID bookingId, long expectedVersion, long newVersion) {
        int advanced = jdbcTemplate.update("""
                UPDATE booking_financial_locks
                SET last_room_change_version = ?
                WHERE booking_id = ? AND last_room_change_version = ?
                """, newVersion, bookingId, expectedVersion);
        if (advanced != 1) {
            throw new IllegalStateException("Không thể advance room-change financial version");
        }
    }

    private long selectForUpdate(UUID bookingId) {
        LockedBooking row = jdbcTemplate.queryForObject("""
                SELECT booking_id, last_room_change_version
                FROM booking_financial_locks
                WHERE booking_id = ?
                FOR UPDATE
                """, (rs, rowNum) -> new LockedBooking(
                rs.getObject("booking_id", UUID.class),
                rs.getLong("last_room_change_version")
        ), bookingId);
        if (row == null || !bookingId.equals(row.bookingId())) {
            throw new IllegalStateException("Không thể khóa financial state của booking");
        }
        return row.lastRoomChangeVersion();
    }

    private boolean isPostgreSql() {
        String product = jdbcTemplate.execute((ConnectionCallback<String>) connection ->
                connection.getMetaData().getDatabaseProductName());
        if ("PostgreSQL".equalsIgnoreCase(product)) return true;
        if ("H2".equalsIgnoreCase(product)) return false;
        throw new IllegalStateException("Database chưa được kiểm chứng cho financial lock: " + product);
    }

    private record LockedBooking(UUID bookingId, long lastRoomChangeVersion) {}
}
