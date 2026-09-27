package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.wallet.entity.HotelCustomerTransfer;
import com.smarthotel.payment.wallet.entity.HotelCustomerTransferStatus;
import com.smarthotel.payment.wallet.entity.Wallet;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.entity.WalletTransaction;
import com.smarthotel.payment.wallet.entity.WalletTransactionType;
import com.smarthotel.payment.wallet.repository.HotelCustomerTransferRepository;
import com.smarthotel.payment.wallet.repository.WalletRepository;
import com.smarthotel.payment.wallet.repository.WalletTransactionRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

/**
 * Internal payment-service primitive. No controller calls this until booking/payment
 * coordination and hotel-specific funding have been implemented and verified.
 */
@Service
public class HotelCustomerWalletTransferService {
    private final JdbcTemplate jdbc;
    private final WalletRepository wallets;
    private final WalletTransactionRepository transactions;
    private final HotelCustomerTransferRepository transfers;

    public HotelCustomerWalletTransferService(
            JdbcTemplate jdbc,
            WalletRepository wallets,
            WalletTransactionRepository transactions,
            HotelCustomerTransferRepository transfers
    ) {
        this.jdbc = jdbc;
        this.wallets = wallets;
        this.transactions = transactions;
        this.transfers = transfers;
    }

    @Transactional
    public HotelCustomerTransfer transfer(
            UUID operationId, UUID bookingId, UUID hotelId, UUID customerId, BigDecimal amount
    ) {
        if (operationId == null || bookingId == null || hotelId == null || customerId == null) {
            throw new IllegalArgumentException("Thiếu định danh giao dịch chuyển ví");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("Số tiền chuyển ví phải lớn hơn 0");
        }
        final BigDecimal wholeDong;
        try {
            wholeDong = amount.setScale(0, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException("Số tiền chuyển ví phải là số đồng nguyên", exception);
        }

        // PostgreSQL ON CONFLICT waits for a concurrent insert with the same ID.
        // MERGE can instead throw a uniqueness error, so it is only used by H2 tests.
        insertTransferIfAbsent(operationId, bookingId, hotelId, customerId, wholeDong);
        HotelCustomerTransfer transfer = transfers.findForUpdate(operationId)
                .orElseThrow(() -> new IllegalStateException("Không tìm thấy giao dịch chuyển ví"));
        if (!bookingId.equals(transfer.getBookingId())
                || !hotelId.equals(transfer.getHotelId())
                || !customerId.equals(transfer.getCustomerId())
                || wholeDong.compareTo(transfer.getAmount()) != 0) {
            throw new IllegalStateException("Mã giao dịch đã dùng cho khoản chuyển ví khác");
        }
        if (transfer.getStatus() == HotelCustomerTransferStatus.COMPLETED) {
            requireCompleteLedger(transfer);
            return transfer;
        }

        // Never use the legacy HOTEL_ADMIN pool or a hotel's pending/locked money.
        Wallet hotel = wallets.findForUpdate(WalletOwnerType.HOTEL, hotelId)
                .orElseThrow(() -> new IllegalStateException(
                        "Ví theo khách sạn chưa được đối soát và cấp số dư"));
        hotel.debitAvailable(wholeDong);

        // The customer wallet may not exist yet. Upsert avoids a creation race.
        insertCustomerWalletIfAbsent(customerId);
        Wallet customer = wallets.findForUpdate(WalletOwnerType.CUSTOMER, customerId)
                .orElseThrow(() -> new IllegalStateException("Không tìm thấy Ví Enziu của Customer"));
        customer.creditCustomerRefund(wholeDong);

        transactions.save(WalletTransaction.forHotelCustomerTransfer(
                hotel.getId(), operationId, WalletTransactionType.HOTEL_TO_CUSTOMER_DEBIT,
                wholeDong.negate(), "Chuyển tiền đổi phòng booking " + bookingId));
        transactions.save(WalletTransaction.forHotelCustomerTransfer(
                customer.getId(), operationId, WalletTransactionType.HOTEL_TO_CUSTOMER_CREDIT,
                wholeDong, "Nhận tiền đổi phòng booking " + bookingId));
        transfer.complete();
        return transfer;
    }

    private void insertTransferIfAbsent(
            UUID operationId, UUID bookingId, UUID hotelId, UUID customerId, BigDecimal amount
    ) {
        if (isPostgreSql()) {
            jdbc.update("""
                    INSERT INTO hotel_customer_transfers
                        (id, booking_id, hotel_id, customer_id, amount, status)
                    VALUES (?, ?, ?, ?, ?, 'RESERVED')
                    ON CONFLICT (id) DO NOTHING
                    """, operationId, bookingId, hotelId, customerId, amount);
        } else {
            jdbc.update("""
                    MERGE INTO hotel_customer_transfers AS target
                    USING (VALUES (?, ?, ?, ?, ?)) AS source
                        (id, booking_id, hotel_id, customer_id, amount)
                    ON target.id = source.id
                    WHEN NOT MATCHED THEN INSERT
                        (id, booking_id, hotel_id, customer_id, amount, status)
                        VALUES (source.id, source.booking_id, source.hotel_id,
                                source.customer_id, source.amount, 'RESERVED')
                    """, operationId, bookingId, hotelId, customerId, amount);
        }
    }

    private void insertCustomerWalletIfAbsent(UUID customerId) {
        UUID walletId = UUID.randomUUID();
        if (isPostgreSql()) {
            jdbc.update("""
                    INSERT INTO wallets
                        (id, owner_type, owner_id, available_balance, pending_balance,
                         locked_balance, commission_debt, total_earned, total_withdrawn,
                         version, created_at, updated_at)
                    VALUES (?, 'CUSTOMER', ?, 0, 0, 0, 0, 0, 0, 0,
                            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (owner_type, owner_id) DO NOTHING
                    """, walletId, customerId);
        } else {
            jdbc.update("""
                    MERGE INTO wallets AS target
                    USING (VALUES (?, ?)) AS source (id, owner_id)
                    ON target.owner_type = 'CUSTOMER' AND target.owner_id = source.owner_id
                    WHEN NOT MATCHED THEN INSERT
                        (id, owner_type, owner_id, available_balance, pending_balance,
                         locked_balance, commission_debt, total_earned, total_withdrawn,
                         version, created_at, updated_at)
                        VALUES (source.id, 'CUSTOMER', source.owner_id, 0, 0, 0,
                                0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """, walletId, customerId);
        }
    }

    private boolean isPostgreSql() {
        String product = jdbc.execute((ConnectionCallback<String>) connection ->
                connection.getMetaData().getDatabaseProductName());
        if ("PostgreSQL".equalsIgnoreCase(product)) return true;
        if ("H2".equalsIgnoreCase(product)) return false;
        throw new IllegalStateException("Database chưa được kiểm chứng cho chuyển ví: " + product);
    }

    private void requireCompleteLedger(HotelCustomerTransfer transfer) {
        List<WalletTransaction> entries = transactions.findAllByTransferIdOrderByCreatedAtAsc(transfer.getId());
        UUID hotelWalletId = wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.HOTEL, transfer.getHotelId())
                .map(Wallet::getId).orElse(null);
        UUID customerWalletId = wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER,
                transfer.getCustomerId()).map(Wallet::getId).orElse(null);
        if (entries.size() != 2
                || entries.stream().filter(entry -> entry.getType()
                        == WalletTransactionType.HOTEL_TO_CUSTOMER_DEBIT
                        && entry.getWalletId().equals(hotelWalletId)
                        && entry.getAmount().compareTo(transfer.getAmount().negate()) == 0).count() != 1
                || entries.stream().filter(entry -> entry.getType()
                        == WalletTransactionType.HOTEL_TO_CUSTOMER_CREDIT
                        && entry.getWalletId().equals(customerWalletId)
                        && entry.getAmount().compareTo(transfer.getAmount()) == 0).count() != 1) {
            throw new IllegalStateException("Sổ chuyển ví không nhất quán; cần đối soát thủ công");
        }
    }
}
