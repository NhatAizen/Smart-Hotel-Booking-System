package com.smarthotel.booking.booking.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Production-like upgrade proof for the room-change financial outbox migration.
 *
 * <p>The test is intentionally opt-in because it cleans its dedicated database. The URL guard
 * prevents it from ever pointing at a remote or non-test database.</p>
 */
@EnabledIfEnvironmentVariable(named = "CI_BOOKING_MIGRATION_POSTGRES", matches = "true")
class BookingRoomChangeOutboxPostgresUpgradeTest {

    private static final String PRE_OUTBOX_VERSION = "20260903.03";

    @Test
    void preservesExistingBookingFinancialStateAndAddsOrderedOutboxSchema() throws Exception {
        String url = System.getenv("BOOKING_MIGRATION_DB_URL");
        String user = System.getenv("BOOKING_MIGRATION_DB_USERNAME");
        String password = System.getenv("BOOKING_MIGRATION_DB_PASSWORD");
        assertNotNull(url, "BOOKING_MIGRATION_DB_URL is required");
        assertNotNull(user, "BOOKING_MIGRATION_DB_USERNAME is required");
        assertNotNull(password, "BOOKING_MIGRATION_DB_PASSWORD is required");
        assertTrue(url.matches(
                "^jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/booking_migration_ci(?:\\?.*)?$"
        ), "migration test may only clean the local booking_migration_ci database");

        Flyway cleanable = Flyway.configure()
                .dataSource(url, user, password)
                .cleanDisabled(false)
                .load();
        cleanable.clean();

        Flyway.configure()
                .dataSource(url, user, password)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion(PRE_OUTBOX_VERSION))
                .load()
                .migrate();

        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID hotelId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            execute(connection, """
                    INSERT INTO bookings (
                        id, customer_id, hotel_id, room_id, check_in, check_out,
                        guest_count, total_price, status, booking_code, check_in_code,
                        paid_amount, remaining_amount, payment_option, payment_status,
                        base_accommodation_amount, created_at, updated_at
                    ) VALUES (
                        ?, ?, ?, ?, DATE '2026-10-10', DATE '2026-10-12',
                        2, 1000000, 'CONFIRMED', ?, ?,
                        600000, 400000, 'DEPOSIT', 'PARTIALLY_PAID',
                        1000000, TIMESTAMPTZ '2026-09-30 10:00:00+00',
                        TIMESTAMPTZ '2026-09-30 10:00:00+00'
                    )
                    """, bookingId, customerId, hotelId, roomId,
                    "EZR-MIG-" + bookingId.toString().substring(0, 20),
                    "ENZIU-CHECKIN:" + bookingId);
        }

        Flyway upgraded = Flyway.configure()
                .dataSource(url, user, password)
                .locations("classpath:db/migration")
                .load();
        assertEquals(1, upgraded.migrate().migrationsExecuted);
        upgraded.validate();
        assertEquals(0, upgraded.migrate().migrationsExecuted);

        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM flyway_schema_history
                    WHERE version = '20260930.01' AND success
                    """));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM bookings WHERE id = '" + bookingId + "'"));

            try (PreparedStatement statement = connection.prepareStatement("""
                    SELECT customer_id, hotel_id, room_id, total_price, paid_amount,
                           remaining_amount, payment_option, payment_status,
                           room_change_financial_version
                    FROM bookings WHERE id = ?
                    """)) {
                statement.setObject(1, bookingId);
                try (ResultSet row = statement.executeQuery()) {
                    assertTrue(row.next());
                    assertEquals(customerId, row.getObject(1, UUID.class));
                    assertEquals(hotelId, row.getObject(2, UUID.class));
                    assertEquals(roomId, row.getObject(3, UUID.class));
                    assertMoney("1000000", row.getBigDecimal(4));
                    assertMoney("600000", row.getBigDecimal(5));
                    assertMoney("400000", row.getBigDecimal(6));
                    assertEquals("DEPOSIT", row.getString(7));
                    assertEquals("PARTIALLY_PAID", row.getString(8));
                    assertEquals(0, row.getLong(9));
                }
            }

            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'bookings'
                      AND column_name = 'room_change_financial_version'
                      AND data_type = 'bigint'
                      AND is_nullable = 'NO'
                      AND column_default LIKE '0%'
                    """));
            assertConstraintExists(connection, "bookings",
                    "ck_bookings_room_change_financial_version");
            assertConstraintExists(connection, "room_change_financial_outbox",
                    "uq_room_change_financial_outbox_change");
            assertConstraintExists(connection, "room_change_financial_outbox",
                    "uq_room_change_financial_outbox_booking_version");
            assertConstraintExists(connection, "room_change_financial_outbox",
                    "ck_room_change_financial_outbox_status");
            assertConstraintExists(connection, "room_change_financial_outbox",
                    "ck_room_change_financial_outbox_total");
            assertConstraintExists(connection, "room_change_financial_outbox",
                    "ck_room_change_financial_outbox_expected_retained");
            assertConstraintExists(connection, "room_change_financial_outbox",
                    "ck_room_change_financial_outbox_version");
            assertConstraintExists(connection, "room_change_financial_outbox",
                    "ck_room_change_financial_outbox_attempts");
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = 'room_change_financial_outbox'
                      AND indexname = 'idx_room_change_financial_outbox_pending'
                      AND indexdef ILIKE '%WHERE%status%PENDING%'
                    """));

            UUID roomChangeId = UUID.randomUUID();
            execute(connection, """
                    INSERT INTO room_change_financial_outbox (
                        event_id, room_change_id, booking_id, customer_id,
                        new_booking_total, expected_net_retained_amount,
                        room_change_version, occurred_at
                    ) VALUES (?, ?, ?, ?, 800000, 1000000, 1, CURRENT_TIMESTAMP)
                    """, UUID.randomUUID(), roomChangeId, bookingId, customerId);
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM room_change_financial_outbox
                    WHERE booking_id = '""" + bookingId + "' AND room_change_version = 1"));

            assertThrows(SQLException.class, () -> execute(connection, """
                    INSERT INTO room_change_financial_outbox (
                        event_id, room_change_id, booking_id, customer_id,
                        new_booking_total, expected_net_retained_amount,
                        room_change_version, occurred_at
                    ) VALUES (?, ?, ?, ?, 750000, 1000000, 1, CURRENT_TIMESTAMP)
                    """, UUID.randomUUID(), UUID.randomUUID(), bookingId, customerId));
            assertThrows(SQLException.class, () -> execute(connection, """
                    INSERT INTO room_change_financial_outbox (
                        event_id, room_change_id, booking_id, customer_id,
                        new_booking_total, expected_net_retained_amount,
                        room_change_version, occurred_at
                    ) VALUES (?, ?, ?, ?, 750000, 1000000, 0, CURRENT_TIMESTAMP)
                    """, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), customerId));
            assertThrows(SQLException.class, () -> execute(connection,
                    "UPDATE bookings SET room_change_financial_version = -1 WHERE id = ?",
                    bookingId));
        }
    }

    private static void assertConstraintExists(
            Connection connection,
            String table,
            String constraint
    ) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT count(*) FROM pg_constraint
                WHERE conrelid = to_regclass(?) AND conname = ?
                """)) {
            statement.setString(1, "public." + table);
            statement.setString(2, constraint);
            try (ResultSet row = statement.executeQuery()) {
                assertTrue(row.next());
                assertEquals(1, row.getLong(1),
                        () -> "missing constraint " + constraint + " on " + table);
            }
        }
    }

    private static void execute(Connection connection, String sql, Object... values) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int index = 0; index < values.length; index++) {
                statement.setObject(index + 1, values[index]);
            }
            assertEquals(1, statement.executeUpdate());
        }
    }

    private static long scalarLong(Connection connection, String sql) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet row = statement.executeQuery()) {
            assertTrue(row.next());
            return row.getLong(1);
        }
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual));
    }
}
