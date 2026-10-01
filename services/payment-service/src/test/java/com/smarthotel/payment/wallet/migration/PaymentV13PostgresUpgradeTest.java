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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** V12 production-like financial data upgraded in an isolated PostgreSQL database. */
@EnabledIfEnvironmentVariable(named = "CI_MIGRATION_POSTGRES", matches = "true")
class PaymentV13PostgresUpgradeTest {
    @Test
    void preservesV12WalletWithdrawalLedgerAndTransferRows() throws Exception {
        String url = System.getenv("DB_URL");
        String user = System.getenv("DB_USERNAME");
        String password = System.getenv("DB_PASSWORD");
        assertNotNull(url);
        assertTrue(url.matches(
                "^jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/payment_migration_ci(?:\\?.*)?$"
        ));

        Flyway cleanable = Flyway.configure().dataSource(url, user, password)
                .cleanDisabled(false).load();
        cleanable.clean();

        Flyway.configure().dataSource(url, user, password)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("12"))
                .load().migrate();

        UUID customerId = UUID.randomUUID();
        UUID customerWalletId = UUID.randomUUID();
        UUID hotelAdminId = UUID.randomUUID();
        UUID hotelAdminWalletId = UUID.randomUUID();
        UUID hotelId = UUID.randomUUID();
        UUID hotelWalletId = UUID.randomUUID();
        UUID withdrawalId = UUID.randomUUID();
        UUID ledgerId = UUID.randomUUID();
        UUID transferId = UUID.randomUUID();
        UUID paymentOrderId = UUID.randomUUID();
        UUID paymentId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        long orderCode = 202609300001L;
        long walletRowsBefore;
        long withdrawalRowsBefore;
        long ledgerRowsBefore;
        long transferRowsBefore;
        long paymentOrderRowsBefore;
        long paymentRowsBefore;
        long transactionTypeConstraintOidBefore;
        String transactionTypeConstraintDefinitionBefore;
        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            execute(connection, """
                    INSERT INTO payment_orders (
                        id, order_code, customer_id, payment_type, method, amount,
                        status, description, payment_link_id, provider_status,
                        provider_reference, wallet_applied, paid_at)
                    VALUES (?, ?, ?, 'FULL_PAYMENT', 'PAYOS', 1000000,
                        'PAID', 'V12 migration fixture', 'plink-v12', 'PAID',
                        'provider-order-v12', TRUE, TIMESTAMPTZ '2026-09-29 01:23:45+00')
                    """, paymentOrderId, orderCode, customerId);
            execute(connection, """
                    INSERT INTO payments (
                        id, booking_id, customer_id, amount, method, status,
                        transaction_code, paid_at, payment_type, payment_order_id,
                        hotel_id, hotel_owner_id, commission_rate, commission_amount,
                        hotel_net_amount, booking_applied, wallet_applied, revenue_released)
                    VALUES (?, ?, ?, 1000000, 'PAYOS', 'PAID',
                        'payment-reference-v12', TIMESTAMPTZ '2026-09-29 01:23:45+00',
                        'FULL_PAYMENT', ?, ?, ?, 10, 100000, 900000, TRUE, TRUE, FALSE)
                    """, paymentId, bookingId, customerId, paymentOrderId, hotelId, hotelAdminId);
            execute(connection, """
                    INSERT INTO wallets (id, owner_type, owner_id, available_balance,
                        pending_balance, locked_balance, commission_debt, total_earned,
                        total_withdrawn)
                    VALUES (?, 'CUSTOMER', ?, 700000, 0, 200000, 0, 900000, 0)
                    """, customerWalletId, customerId);
            execute(connection, """
                    INSERT INTO wallets (id, owner_type, owner_id, available_balance,
                        pending_balance, locked_balance, commission_debt, total_earned,
                        total_withdrawn)
                    VALUES (?, 'HOTEL_ADMIN', ?, 450000, 100000, 50000, 25000, 700000, 150000)
                    """, hotelAdminWalletId, hotelAdminId);
            execute(connection, """
                    INSERT INTO wallets (id, owner_type, owner_id, available_balance)
                    VALUES (?, 'HOTEL', ?, 300000)
                    """, hotelWalletId, hotelId);
            execute(connection, """
                    INSERT INTO withdrawal_requests (
                        id, wallet_id, hotel_owner_id, owner_type, amount, payout_method,
                        bank_name, bank_bin, account_number, account_name, status)
                    VALUES (?, ?, ?, 'CUSTOMER', 200000, 'BANK_ACCOUNT',
                            'ACB', '970416', '123456789', 'CUSTOMER TEST', 'PENDING')
                    """, withdrawalId, customerWalletId, customerId);
            execute(connection, """
                    INSERT INTO wallet_transactions (
                        id, wallet_id, withdrawal_id, type, amount, description)
                    VALUES (?, ?, ?, 'WITHDRAWAL_HOLD', -200000, 'V12 historical hold')
                    """, ledgerId, customerWalletId, withdrawalId);
            execute(connection, """
                    INSERT INTO hotel_customer_transfers (
                        id, booking_id, hotel_id, customer_id, amount, status, completed_at)
                    VALUES (?, ?, ?, ?, 100000, 'COMPLETED', CURRENT_TIMESTAMP)
                    """, transferId, UUID.randomUUID(), hotelId, customerId);

            walletRowsBefore = scalarLong(connection, "SELECT count(*) FROM wallets");
            withdrawalRowsBefore = scalarLong(connection, "SELECT count(*) FROM withdrawal_requests");
            ledgerRowsBefore = scalarLong(connection, "SELECT count(*) FROM wallet_transactions");
            transferRowsBefore = scalarLong(connection, "SELECT count(*) FROM hotel_customer_transfers");
            paymentOrderRowsBefore = scalarLong(connection, "SELECT count(*) FROM payment_orders");
            paymentRowsBefore = scalarLong(connection, "SELECT count(*) FROM payments");
            transactionTypeConstraintOidBefore = scalarLong(connection, """
                    SELECT oid FROM pg_constraint
                    WHERE conrelid = 'wallet_transactions'::regclass
                      AND conname = 'ck_wallet_transaction_type'
                    """);
            transactionTypeConstraintDefinitionBefore = scalarString(connection, """
                    SELECT pg_get_constraintdef(oid) FROM pg_constraint
                    WHERE conrelid = 'wallet_transactions'::regclass
                      AND conname = 'ck_wallet_transaction_type'
                    """);
        }

        Flyway upgraded = Flyway.configure().dataSource(url, user, password)
                .locations("classpath:db/migration").load();
        upgraded.migrate();
        upgraded.validate();
        assertEquals(0, upgraded.migrate().migrationsExecuted);

        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            assertEquals(13, scalarLong(connection,
                    "SELECT count(*) FROM flyway_schema_history WHERE success"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM flyway_schema_history WHERE version = '13' AND success"));
            assertEquals(walletRowsBefore, scalarLong(connection, "SELECT count(*) FROM wallets"));
            assertEquals(withdrawalRowsBefore, scalarLong(connection, "SELECT count(*) FROM withdrawal_requests"));
            assertEquals(ledgerRowsBefore, scalarLong(connection, "SELECT count(*) FROM wallet_transactions"));
            assertEquals(transferRowsBefore, scalarLong(connection, "SELECT count(*) FROM hotel_customer_transfers"));
            assertEquals(paymentOrderRowsBefore, scalarLong(connection, "SELECT count(*) FROM payment_orders"));
            assertEquals(paymentRowsBefore, scalarLong(connection, "SELECT count(*) FROM payments"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM wallets WHERE id = '" + customerWalletId + "'"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM wallets WHERE id = '" + hotelAdminWalletId + "' AND owner_type = 'HOTEL_ADMIN'"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM wallets WHERE id = '" + hotelWalletId + "' AND owner_type = 'HOTEL'"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM wallets WHERE owner_type = 'PLATFORM'"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM withdrawal_requests WHERE id = '" + withdrawalId + "' AND status = 'PENDING'"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM wallet_transactions WHERE id = '" + ledgerId + "'"));
            assertEquals(1, scalarLong(connection,
                    "SELECT count(*) FROM hotel_customer_transfers WHERE id = '" + transferId + "' AND status = 'COMPLETED'"));
            assertMoney("700000", scalarMoney(connection,
                    "SELECT available_balance FROM wallets WHERE id = '" + customerWalletId + "'"));
            assertMoney("200000", scalarMoney(connection,
                    "SELECT locked_balance FROM wallets WHERE id = '" + customerWalletId + "'"));
            assertMoney("450000", scalarMoney(connection,
                    "SELECT available_balance FROM wallets WHERE id = '" + hotelAdminWalletId + "'"));
            assertMoney("25000", scalarMoney(connection,
                    "SELECT commission_debt FROM wallets WHERE id = '" + hotelAdminWalletId + "'"));
            assertMoney("300000", scalarMoney(connection,
                    "SELECT available_balance FROM wallets WHERE id = '" + hotelWalletId + "'"));
            assertWalletBalances(
                    connection, customerWalletId,
                    "700000", "0", "200000", "0", "900000", "0"
            );
            assertWalletBalances(
                    connection, hotelAdminWalletId,
                    "450000", "100000", "50000", "25000", "700000", "150000"
            );
            assertWalletBalances(
                    connection, hotelWalletId,
                    "300000", "0", "0", "0", "0", "0"
            );

            try (PreparedStatement statement = connection.prepareStatement("""
                    SELECT booking_id, customer_id, amount, status, transaction_code,
                           payment_order_id, hotel_id, hotel_owner_id,
                           commission_amount, hotel_net_amount,
                           booking_applied, wallet_applied, revenue_released
                    FROM payments WHERE id = ?
                    """)) {
                statement.setObject(1, paymentId);
                try (ResultSet row = statement.executeQuery()) {
                    assertTrue(row.next());
                    assertEquals(bookingId, row.getObject(1, UUID.class));
                    assertEquals(customerId, row.getObject(2, UUID.class));
                    assertMoney("1000000", row.getBigDecimal(3));
                    assertEquals("PAID", row.getString(4));
                    assertEquals("payment-reference-v12", row.getString(5));
                    assertEquals(paymentOrderId, row.getObject(6, UUID.class));
                    assertEquals(hotelId, row.getObject(7, UUID.class));
                    assertEquals(hotelAdminId, row.getObject(8, UUID.class));
                    assertMoney("100000", row.getBigDecimal(9));
                    assertMoney("900000", row.getBigDecimal(10));
                    assertTrue(row.getBoolean(11));
                    assertTrue(row.getBoolean(12));
                    assertEquals(false, row.getBoolean(13));
                }
            }
            try (PreparedStatement statement = connection.prepareStatement("""
                    SELECT order_code, customer_id, amount, status, payment_link_id,
                           provider_status, provider_reference, wallet_applied
                    FROM payment_orders WHERE id = ?
                    """)) {
                statement.setObject(1, paymentOrderId);
                try (ResultSet row = statement.executeQuery()) {
                    assertTrue(row.next());
                    assertEquals(orderCode, row.getLong(1));
                    assertEquals(customerId, row.getObject(2, UUID.class));
                    assertMoney("1000000", row.getBigDecimal(3));
                    assertEquals("PAID", row.getString(4));
                    assertEquals("plink-v12", row.getString(5));
                    assertEquals("PAID", row.getString(6));
                    assertEquals("provider-order-v12", row.getString(7));
                    assertTrue(row.getBoolean(8));
                }
            }

            try (PreparedStatement statement = connection.prepareStatement("""
                    SELECT balance_before, balance_after, reference_type, reference_id,
                           idempotency_key, actor_type, actor_id
                    FROM wallet_transactions WHERE id = ?
                    """)) {
                statement.setObject(1, ledgerId);
                try (ResultSet row = statement.executeQuery()) {
                    assertTrue(row.next());
                    for (int index = 1; index <= 7; index++) assertNull(row.getObject(index));
                }
            }
            try (PreparedStatement statement = connection.prepareStatement("""
                    SELECT status, idempotency_key, completion_idempotency_key
                    FROM withdrawal_requests WHERE id = ?
                    """)) {
                statement.setObject(1, withdrawalId);
                try (ResultSet row = statement.executeQuery()) {
                    assertTrue(row.next());
                    assertEquals("PENDING", row.getString(1));
                    assertNull(row.getObject(2));
                    assertNull(row.getObject(3));
                }
            }
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_indexes
                    WHERE tablename = 'wallet_transactions'
                      AND indexname = 'uq_wallet_transactions_idempotency_key'
                    """));
            assertEquals(8, scalarLong(connection, """
                    SELECT count(*) FROM pg_indexes
                    WHERE schemaname = 'public' AND indexname IN (
                        'uq_wallet_transactions_idempotency_key',
                        'idx_wallet_transactions_reference',
                        'idx_wallet_transactions_wallet_created_id',
                        'uq_withdrawal_owner_idempotency',
                        'uq_withdrawal_completion_idempotency',
                        'idx_withdrawals_owner_status_created',
                        'idx_withdrawals_status_created',
                        'idx_financial_event_booking'
                    )
                    """));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_class
                    WHERE oid = to_regclass('public.financial_event_inbox')
                    """));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_class
                    WHERE oid = to_regclass('public.booking_financial_locks')
                    """));
            assertEquals(transactionTypeConstraintOidBefore, scalarLong(connection, """
                    SELECT oid FROM pg_constraint
                    WHERE conrelid = 'wallet_transactions'::regclass
                      AND conname = 'ck_wallet_transaction_type'
                    """));
            assertEquals(transactionTypeConstraintDefinitionBefore, scalarString(connection, """
                    SELECT pg_get_constraintdef(oid) FROM pg_constraint
                    WHERE conrelid = 'wallet_transactions'::regclass
                      AND conname = 'ck_wallet_transaction_type'
                    """));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_constraint
                    WHERE conrelid = 'financial_event_inbox'::regclass
                      AND conname = 'uq_financial_event_booking_version'
                    """));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_constraint
                    WHERE conrelid = 'financial_event_inbox'::regclass
                      AND conname = 'ck_financial_event_room_change_version'
                    """));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_constraint
                    WHERE conrelid = 'financial_event_inbox'::regclass
                      AND conname = 'ck_financial_event_expected_retained'
                    """));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM pg_constraint
                    WHERE conrelid = 'booking_financial_locks'::regclass
                      AND conname = 'ck_booking_financial_lock_version'
                    """));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'booking_financial_locks'
                      AND column_name = 'last_room_change_version'
                      AND is_nullable = 'NO'
                      AND column_default IN ('0', '0::bigint')
                    """));
            assertEquals(1, scalarLong(connection, """
                    SELECT count(*) FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'financial_event_inbox'
                      AND column_name = 'room_change_version'
                      AND is_nullable = 'NO'
                    """));

            UUID partialResultBookingId = UUID.randomUUID();
            UUID partialResultCustomerId = UUID.randomUUID();
            assertThrows(SQLException.class, () -> execute(connection, """
                    INSERT INTO financial_event_inbox (
                        id, operation_type, operation_id, booking_id,
                        room_change_version, customer_id, new_booking_total,
                        expected_net_retained_amount, occurred_at,
                        valid_paid_amount, credited_amount, processed_at
                    ) VALUES (?, 'ROOM_CHANGE_CREDIT', ?, ?, 1, ?, 1000, 1000,
                              CURRENT_TIMESTAMP, 1000, NULL, CURRENT_TIMESTAMP)
                    """, UUID.randomUUID(), UUID.randomUUID(),
                    partialResultBookingId, partialResultCustomerId));
            assertThrows(SQLException.class, () -> execute(connection, """
                    INSERT INTO financial_event_inbox (
                        id, operation_type, operation_id, booking_id,
                        room_change_version, customer_id, new_booking_total,
                        expected_net_retained_amount, occurred_at,
                        valid_paid_amount, credited_amount, processed_at
                    ) VALUES (?, 'ROOM_CHANGE_CREDIT', ?, ?, 1, ?, 1000, 1000,
                              CURRENT_TIMESTAMP, NULL, 0, CURRENT_TIMESTAMP)
                    """, UUID.randomUUID(), UUID.randomUUID(),
                    partialResultBookingId, partialResultCustomerId));
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

    private static BigDecimal scalarMoney(Connection connection, String sql) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet row = statement.executeQuery()) {
            assertTrue(row.next());
            return row.getBigDecimal(1);
        }
    }

    private static String scalarString(Connection connection, String sql) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet row = statement.executeQuery()) {
            assertTrue(row.next());
            return row.getString(1);
        }
    }

    private static void assertWalletBalances(
            Connection connection,
            UUID walletId,
            String available,
            String pending,
            String locked,
            String commissionDebt,
            String totalEarned,
            String totalWithdrawn
    ) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT available_balance, pending_balance, locked_balance,
                       commission_debt, total_earned, total_withdrawn
                FROM wallets WHERE id = ?
                """)) {
            statement.setObject(1, walletId);
            try (ResultSet row = statement.executeQuery()) {
                assertTrue(row.next());
                assertMoney(available, row.getBigDecimal(1));
                assertMoney(pending, row.getBigDecimal(2));
                assertMoney(locked, row.getBigDecimal(3));
                assertMoney(commissionDebt, row.getBigDecimal(4));
                assertMoney(totalEarned, row.getBigDecimal(5));
                assertMoney(totalWithdrawn, row.getBigDecimal(6));
            }
        }
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual));
    }
}
