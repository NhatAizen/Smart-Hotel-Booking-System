package com.smarthotel.hotel.pricing.migration;

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

import static org.junit.jupiter.api.Assertions.*;

/** Uses only the disposable PostgreSQL 16 service created by GitHub Actions. */
@EnabledIfEnvironmentVariable(named = "CI_MIGRATION_POSTGRES", matches = "true")
class HotelDailyPricingPostgresUpgradeTest {
    @Test
    void upgradesExistingCatalogToManualDailyPriceRuleSchema() throws Exception {
        String url = System.getenv("DB_URL");
        String user = System.getenv("DB_USERNAME");
        String password = System.getenv("DB_PASSWORD");
        assertNotNull(url);
        assertTrue(url.startsWith("jdbc:postgresql://localhost:5432/hotel_migration_ci"));

        Flyway preUpgrade = Flyway.configure().dataSource(url, user, password)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("20260828.01"))
                .load();
        preUpgrade.migrate();

        UUID hotelId = UUID.randomUUID();
        UUID typeId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        long priorHistoryCount;
        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            priorHistoryCount = scalarLong(connection,
                    "SELECT count(*) FROM flyway_schema_history WHERE success");
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM flyway_schema_history
                    WHERE version = '20260828.01' AND success
                    """));
            try (PreparedStatement hotel = connection.prepareStatement("""
                    INSERT INTO hotels (id, owner_id, name, address, city)
                    VALUES (?, ?, 'CI Synthetic Hotel', 'CI Street', 'CI City')
                    """)) {
                hotel.setObject(1, hotelId);
                hotel.setObject(2, UUID.randomUUID());
                assertEquals(1, hotel.executeUpdate());
            }
            try (PreparedStatement type = connection.prepareStatement("""
                    INSERT INTO room_types (id, hotel_id, name, base_price,
                        approved_base_price, max_adults, approval_status)
                    VALUES (?, ?, 'CI Deluxe', 1000000, 1000000, 2, 'APPROVED')
                    """)) {
                type.setObject(1, typeId);
                type.setObject(2, hotelId);
                assertEquals(1, type.executeUpdate());
            }
            try (PreparedStatement room = connection.prepareStatement("""
                    INSERT INTO rooms (id, hotel_id, room_type_id, room_number, custom_price)
                    VALUES (?, ?, ?, 'CI-201', 900000)
                    """)) {
                room.setObject(1, roomId);
                room.setObject(2, hotelId);
                room.setObject(3, typeId);
                assertEquals(1, room.executeUpdate());
            }
        }

        Flyway upgraded = Flyway.configure().dataSource(url, user, password)
                .locations("classpath:db/migration").load();
        upgraded.migrate();
        upgraded.validate();

        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            assertEquals(priorHistoryCount + 1, scalarLong(connection,
                    "SELECT count(*) FROM flyway_schema_history WHERE success"));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM flyway_schema_history
                    WHERE version = '20260920.01' AND success
                    """));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.manual_daily_price_rules')"));
            assertConstraint(connection, "ck_manual_price_dates", "c");
            assertConstraint(connection, "ck_manual_price_positive", "c");
            assertEquals(2, scalarLong(connection, """
                    SELECT count(*) FROM pg_constraint
                    WHERE conrelid = to_regclass('public.manual_daily_price_rules')
                      AND contype = 'f'
                    """));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_indexes
                    WHERE tablename = 'manual_daily_price_rules'
                      AND indexname = 'idx_manual_price_rules_overlap'
                    """));
            assertMoney("900000", moneyForId(connection,
                    "SELECT custom_price FROM rooms WHERE id = ?", roomId));
            assertMoney("1000000", moneyForId(connection,
                    "SELECT approved_base_price FROM room_types WHERE id = ?", typeId));

            String columns = "(id, hotel_id, room_type_id, start_date, end_date, "
                    + "nightly_price, approved_base_price_at_save, created_at, updated_at)";
            String values = "('%s', '%s', '%s', DATE '%s', DATE '%s', %s, 1000000, now(), now())";
            String insert = "INSERT INTO manual_daily_price_rules " + columns + " VALUES ";
            assertEquals(1, executeUpdate(connection, insert + values.formatted(
                    UUID.randomUUID(), hotelId, typeId, "2027-01-10", "2027-01-12", "800000")));
            assertSqlState(connection, insert + values.formatted(
                    UUID.randomUUID(), hotelId, typeId, "2027-01-13", "2027-01-12", "800000"),
                    "23514");
            assertSqlState(connection, insert + values.formatted(
                    UUID.randomUUID(), hotelId, typeId, "2027-01-13", "2027-01-14", "-1"),
                    "23514");
            assertSqlState(connection, insert + values.formatted(
                    UUID.randomUUID(), hotelId, UUID.randomUUID(), "2027-01-13", "2027-01-14", "800000"),
                    "23503");
        }
    }

    private static long scalarLong(Connection connection, String sql) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet row = statement.executeQuery()) {
            assertTrue(row.next());
            return row.getLong(1);
        }
    }

    private static BigDecimal moneyForId(Connection connection, String sql, UUID id)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setObject(1, id);
            try (ResultSet row = statement.executeQuery()) {
                assertTrue(row.next());
                return row.getBigDecimal(1);
            }
        }
    }

    private static void assertConstraint(Connection connection, String name, String kind)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT count(*) FROM pg_constraint
                WHERE conrelid = to_regclass('public.manual_daily_price_rules')
                  AND conname = ? AND contype::text = ?
                """)) {
            statement.setString(1, name);
            statement.setString(2, kind);
            try (ResultSet row = statement.executeQuery()) {
                assertTrue(row.next());
                assertEquals(1, row.getLong(1), name);
            }
        }
    }

    private static int executeUpdate(Connection connection, String sql) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            return statement.executeUpdate();
        }
    }

    private static void assertSqlState(Connection connection, String sql, String state) {
        SQLException error = assertThrows(SQLException.class, () -> executeUpdate(connection, sql));
        assertEquals(state, error.getSQLState());
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual));
    }
}
