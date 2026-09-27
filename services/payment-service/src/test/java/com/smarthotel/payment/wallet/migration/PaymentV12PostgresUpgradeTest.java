package com.smarthotel.payment.wallet.migration;

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
class PaymentV12PostgresUpgradeTest {
    @Test
    void upgradesV11WithLegacyAdminMoneyWithoutAllocatingItToHotels() throws Exception {
        String url = System.getenv("DB_URL");
        String user = System.getenv("DB_USERNAME");
        String password = System.getenv("DB_PASSWORD");
        assertNotNull(url);
        assertTrue(url.startsWith("jdbc:postgresql://localhost:5432/payment_migration_ci"));

        Flyway preUpgrade = Flyway.configure().dataSource(url, user, password)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("11"))
                .load();
        preUpgrade.migrate();

        UUID ownerId = UUID.randomUUID();
        UUID legacyWalletId = UUID.randomUUID();
        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            assertEquals(11, scalarLong(connection,
                    "SELECT count(*) FROM flyway_schema_history WHERE success"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM flyway_schema_history WHERE version = '11' AND success"));
            try (PreparedStatement insert = connection.prepareStatement("""
                    INSERT INTO wallets (id, owner_type, owner_id, available_balance,
                        pending_balance, locked_balance, commission_debt, total_earned,
                        total_withdrawn)
                    VALUES (?, 'HOTEL_ADMIN', ?, 12345, 200, 100, 50, 12645, 25)
                    """)) {
                insert.setObject(1, legacyWalletId);
                insert.setObject(2, ownerId);
                assertEquals(1, insert.executeUpdate());
            }
        }

        Flyway upgraded = Flyway.configure().dataSource(url, user, password)
                .locations("classpath:db/migration").load();
        upgraded.migrate();
        upgraded.validate();

        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            assertEquals(12, scalarLong(connection,
                    "SELECT count(*) FROM flyway_schema_history WHERE success"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM flyway_schema_history WHERE version = '12' AND success"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM wallets WHERE owner_type = 'HOTEL_ADMIN'"));
            assertEquals(0, scalarLong(connection,
                    "SELECT count(*) FROM wallets WHERE owner_type = 'HOTEL'"));
            try (PreparedStatement query = connection.prepareStatement("""
                    SELECT available_balance, pending_balance, locked_balance,
                           commission_debt, total_earned, total_withdrawn, version
                    FROM wallets WHERE id = ? AND owner_id = ? AND owner_type = 'HOTEL_ADMIN'
                    """)) {
                query.setObject(1, legacyWalletId);
                query.setObject(2, ownerId);
                try (ResultSet row = query.executeQuery()) {
                    assertTrue(row.next());
                    assertMoney("12345", row.getBigDecimal(1));
                    assertMoney("200", row.getBigDecimal(2));
                    assertMoney("100", row.getBigDecimal(3));
                    assertMoney("50", row.getBigDecimal(4));
                    assertMoney("12645", row.getBigDecimal(5));
                    assertMoney("25", row.getBigDecimal(6));
                    assertEquals(0, row.getLong(7));
                    assertFalse(row.next());
                }
            }

            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.hotel_customer_transfers')"));
            assertConstraint(connection, "hotel_customer_transfers", "ck_hotel_customer_transfer_amount");
            assertConstraint(connection, "hotel_customer_transfers", "ck_hotel_customer_transfer_status");
            assertConstraint(connection, "wallet_transactions", "ck_wallet_transfer_link");
            assertConstraint(connection, "wallet_transactions", "ck_wallet_transfer_amount");
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_indexes
                    WHERE tablename = 'wallet_transactions'
                      AND indexname = 'uq_wallet_tx_transfer_type'
                    """));

            UUID transferId = UUID.randomUUID();
            assertCheckViolation(connection, """
                    INSERT INTO hotel_customer_transfers
                        (id, booking_id, hotel_id, customer_id, amount, status)
                    VALUES ('%s', '%s', '%s', '%s', 1.50, 'RESERVED')
                    """.formatted(transferId, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()));
            assertCheckViolation(connection, """
                    INSERT INTO hotel_customer_transfers
                        (id, booking_id, hotel_id, customer_id, amount, status)
                    VALUES ('%s', '%s', '%s', '%s', 100, 'COMPLETED')
                    """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()));
            assertCheckViolation(connection, """
                    INSERT INTO wallet_transactions
                        (id, wallet_id, type, amount, description)
                    VALUES ('%s', '%s', 'HOTEL_TO_CUSTOMER_DEBIT', -100, 'CI synthetic entry')
                    """.formatted(UUID.randomUUID(), legacyWalletId));

            try (PreparedStatement insertHotel = connection.prepareStatement("""
                    INSERT INTO wallets (id, owner_type, owner_id) VALUES (?, 'HOTEL', ?)
                    """)) {
                insertHotel.setObject(1, UUID.randomUUID());
                insertHotel.setObject(2, UUID.randomUUID());
                assertEquals(1, insertHotel.executeUpdate());
            }
            assertEquals(0, scalarLong(connection,
                    "SELECT available_balance FROM wallets WHERE owner_type = 'HOTEL'"));
        }
    }

    private static long scalarLong(Connection connection, String sql) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet row = statement.executeQuery()) {
            assertTrue(row.next());
            return row.getLong(1);
        }
    }

    private static void assertConstraint(Connection connection, String table, String constraint)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT count(*) FROM pg_constraint
                WHERE conrelid = to_regclass(?) AND conname = ?
                """)) {
            statement.setString(1, "public." + table);
            statement.setString(2, constraint);
            try (ResultSet row = statement.executeQuery()) {
                assertTrue(row.next());
                assertEquals(1, row.getLong(1), constraint);
            }
        }
    }

    private static void assertCheckViolation(Connection connection, String sql) {
        SQLException error = assertThrows(SQLException.class, () -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.executeUpdate();
            }
        });
        assertEquals("23514", error.getSQLState());
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual));
    }
}
