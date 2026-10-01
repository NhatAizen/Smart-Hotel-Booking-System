package com.smarthotel.payment.wallet.roomchange;

import com.smarthotel.payment.integration.notification.NotificationClient;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import com.smarthotel.payment.refund.entity.RefundRequestStatus;
import com.smarthotel.payment.refund.repository.RefundRequestRepository;
import com.smarthotel.payment.wallet.entity.HotelCustomerTransferStatus;
import com.smarthotel.payment.wallet.entity.Wallet;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.entity.WalletTransaction;
import com.smarthotel.payment.wallet.entity.WalletTransactionType;
import com.smarthotel.payment.wallet.repository.WalletRepository;
import com.smarthotel.payment.wallet.repository.WalletTransactionRepository;
import com.smarthotel.payment.wallet.repository.HotelCustomerTransferRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class RoomChangeCreditService {
    public static final String OPERATION_TYPE = "ROOM_CHANGE_CREDIT";

    private final PaymentRepository paymentRepository;
    private final WalletRepository walletRepository;
    private final WalletTransactionRepository transactionRepository;
    private final JdbcTemplate jdbcTemplate;
    private final NotificationClient notificationClient;
    private final BookingFinancialLockService bookingFinancialLockService;
    private final RefundRequestRepository refundRequestRepository;
    private final HotelCustomerTransferRepository hotelCustomerTransferRepository;

    private static final Set<RefundRequestStatus> ACTIVE_REFUND_STATUSES = Set.of(
            RefundRequestStatus.PENDING_HOTEL_REVIEW,
            RefundRequestStatus.APPROVED,
            RefundRequestStatus.PARTIALLY_COMPLETED,
            RefundRequestStatus.COMPLETED
    );
    private static final Set<HotelCustomerTransferStatus> EXTERNAL_TRANSFER_STATUSES = Set.of(
            HotelCustomerTransferStatus.RESERVED,
            HotelCustomerTransferStatus.COMPLETED
    );

    public RoomChangeCreditService(
            PaymentRepository paymentRepository,
            WalletRepository walletRepository,
            WalletTransactionRepository transactionRepository,
            JdbcTemplate jdbcTemplate,
            NotificationClient notificationClient,
            BookingFinancialLockService bookingFinancialLockService,
            RefundRequestRepository refundRequestRepository,
            HotelCustomerTransferRepository hotelCustomerTransferRepository
    ) {
        this.paymentRepository = paymentRepository;
        this.walletRepository = walletRepository;
        this.transactionRepository = transactionRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.notificationClient = notificationClient;
        this.bookingFinancialLockService = bookingFinancialLockService;
        this.refundRequestRepository = refundRequestRepository;
        this.hotelCustomerTransferRepository = hotelCustomerTransferRepository;
    }

    /**
     * Financial source of truth for a booking. Only settled PAID rows count;
     * PENDING/FAILED/CANCELLED/EXPIRED and fully REFUNDED rows are excluded.
     * Provider retries update the same PaymentOrder/Payment rows and transaction_code
     * is unique, while distinct PAID rows intentionally represent split payments.
     */
    @Transactional(readOnly = true)
    public BigDecimal calculateValidSettledAmountForBooking(UUID bookingId, UUID customerId) {
        return calculateValidSettledAmountForBooking(bookingId, customerId, Instant.now());
    }

    @Transactional(readOnly = true)
    public BigDecimal calculateValidSettledAmountForBooking(
            UUID bookingId,
            UUID customerId,
            Instant settledAtOrBefore
    ) {
        validateIdentity(bookingId, "bookingId");
        validateIdentity(customerId, "customerId");
        if (settledAtOrBefore == null) {
            throw new IllegalArgumentException("settledAtOrBefore không được để trống");
        }
        verifySettledPaymentOwnership(bookingId, customerId, settledAtOrBefore);
        return money(paymentRepository.sumAmountByBookingIdAndStatusAtOrBefore(
                bookingId, PaymentStatus.PAID, settledAtOrBefore
        ));
    }

    @Transactional
    public RoomChangeCreditResult process(RoomChangeFinancialCommand command) {
        validate(command);

        long lastProcessedVersion = bookingFinancialLockService.lock(command.bookingId());
        int claimed = claim(command);

        if (claimed == 0) {
            return loadReplay(command);
        }

        requireNextVersion(command, lastProcessedVersion);

        failIfAutomaticReconciliationIsUnsafe(command.bookingId());

        RoomChangeSettlementPosition position = getRoomChangeSettlementPosition(command);
        if (position.netRetainedForBooking().compareTo(
                money(command.expectedNetRetainedAmount())
        ) < 0) {
            throw new IllegalStateException(
                    "SETTLEMENT_NOT_YET_VISIBLE: Payment net retained "
                            + position.netRetainedForBooking().toPlainString()
                            + " nhỏ hơn Booking snapshot "
                            + money(command.expectedNetRetainedAmount()).toPlainString()
            );
        }
        if (position.netRetainedForBooking().compareTo(
                money(command.expectedNetRetainedAmount())
        ) > 0) {
            throw new IllegalStateException(
                    "ROOM_CHANGE_RECONCILIATION_REQUIRED: Payment financial position "
                            + "vượt Booking snapshot; không tự động cộng khoản không được xác nhận"
            );
        }
        BigDecimal credit = position.incrementalCreditDue();

        if (credit.signum() > 0) {
            Wallet wallet = getOrCreateCustomerWalletForUpdate(command.customerId());
            BigDecimal before = money(wallet.getAvailableBalance());
            wallet.creditCustomerRefund(credit);
            BigDecimal after = money(wallet.getAvailableBalance());
            transactionRepository.save(WalletTransaction.audited(
                    wallet.getId(),
                    null,
                    WalletTransactionType.CUSTOMER_REFUND_CREDIT,
                    credit,
                    "Hoàn chênh lệch đổi phòng cho booking " + command.bookingId(),
                    before,
                    after,
                    "ROOM_CHANGE",
                    command.roomChangeId().toString(),
                    OPERATION_TYPE + ":" + command.eventId(),
                    "SYSTEM",
                    null
            ));
            afterCommit(() -> notificationClient.sendUser(
                    command.customerId(),
                    "Đã cộng chênh lệch đổi phòng vào Ví Enziu",
                    credit.toPlainString() + " đ đã được cộng vào số dư khả dụng.",
                    "ROOM_CHANGE_WALLET_CREDIT",
                    "PAYMENT",
                    "/customer/wallet"
            ));
        }

        jdbcTemplate.update("""
                UPDATE financial_event_inbox
                SET valid_paid_amount = ?, credited_amount = ?, processed_at = ?
                WHERE operation_type = ? AND operation_id = ?
                """, position.validSettledPayments(), credit, Timestamp.from(Instant.now()),
                OPERATION_TYPE, command.eventId());

        bookingFinancialLockService.advanceRoomChangeVersion(
                command.bookingId(), lastProcessedVersion, command.roomChangeVersion()
        );

        return new RoomChangeCreditResult(
                command.eventId(), position.validSettledPayments(), credit, false
        );
    }

    /**
     * Calculates the cumulative settlement position without trusting Booking's
     * paid amount. Only completed earlier room-change inbox operations count as
     * prior credits; unrelated wallet activity and unprocessed/failed operations
     * cannot affect the result.
     */
    @Transactional(readOnly = true)
    RoomChangeSettlementPosition getRoomChangeSettlementPosition(
            RoomChangeFinancialCommand command
    ) {
        validate(command);
        BigDecimal validSettledPayments = calculateValidSettledAmountForBooking(
                command.bookingId(), command.customerId(), command.occurredAt()
        );
        BigDecimal priorSuccessfulCredits = money(jdbcTemplate.queryForObject("""
                SELECT COALESCE(SUM(credited_amount), 0)
                FROM financial_event_inbox
                WHERE operation_type = ? AND booking_id = ?
                  AND room_change_version < ?
                  AND operation_id <> ?
                  AND credited_amount IS NOT NULL
                """, BigDecimal.class, OPERATION_TYPE, command.bookingId(),
                command.roomChangeVersion(), command.eventId()));
        BigDecimal netRetained = money(validSettledPayments
                .subtract(priorSuccessfulCredits)
                .max(BigDecimal.ZERO));
        BigDecimal targetTotal = money(command.newWholeBookingTotal());
        BigDecimal incrementalCredit = money(netRetained
                .subtract(targetTotal)
                .max(BigDecimal.ZERO));
        BigDecimal additionalPayment = money(targetTotal
                .subtract(netRetained)
                .max(BigDecimal.ZERO));
        return new RoomChangeSettlementPosition(
                command.bookingId(), command.roomChangeVersion(),
                validSettledPayments, priorSuccessfulCredits, netRetained,
                targetTotal, incrementalCredit, additionalPayment
        );
    }

    private RoomChangeCreditResult loadReplay(RoomChangeFinancialCommand command) {
        List<InboxRow> rows = jdbcTemplate.query("""
                SELECT booking_id, customer_id, room_change_version, new_booking_total,
                       expected_net_retained_amount, occurred_at,
                       valid_paid_amount, credited_amount
                FROM financial_event_inbox
                WHERE operation_type = ? AND operation_id = ?
                """, (rs, rowNum) -> new InboxRow(
                rs.getObject("booking_id", UUID.class),
                rs.getObject("customer_id", UUID.class),
                rs.getLong("room_change_version"),
                rs.getBigDecimal("new_booking_total"),
                rs.getBigDecimal("expected_net_retained_amount"),
                rs.getTimestamp("occurred_at").toInstant(),
                rs.getBigDecimal("valid_paid_amount"),
                rs.getBigDecimal("credited_amount")
        ), OPERATION_TYPE, command.eventId());
        if (rows.isEmpty()) {
            Integer versionCollision = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM financial_event_inbox
                    WHERE operation_type = ? AND booking_id = ? AND room_change_version = ?
                    """, Integer.class, OPERATION_TYPE, command.bookingId(),
                    command.roomChangeVersion());
            if (versionCollision != null && versionCollision > 0) {
                throw new IllegalStateException(
                        "DUPLICATE_FINANCIAL_OPERATION: roomChangeVersion đã thuộc event khác"
                );
            }
            throw new IllegalStateException("Không đọc được financial inbox sau xung đột idempotency");
        }
        InboxRow row = rows.get(0);
        if (!row.bookingId().equals(command.bookingId())
                || !row.customerId().equals(command.customerId())
                || row.roomChangeVersion() != command.roomChangeVersion()
                || money(row.newTotal()).compareTo(money(command.newWholeBookingTotal())) != 0
                || money(row.expectedNetRetainedAmount()).compareTo(
                        money(command.expectedNetRetainedAmount())
                ) != 0
                || !row.occurredAt().equals(normalizeEventTime(command.occurredAt()))) {
            throw new IllegalStateException("DUPLICATE_FINANCIAL_OPERATION: payload không khớp eventId đã xử lý");
        }
        if (row.validPaid() == null || row.credited() == null) {
            throw new IllegalStateException("Financial operation trùng đang được xử lý");
        }
        return new RoomChangeCreditResult(
                command.eventId(), money(row.validPaid()), money(row.credited()), true
        );
    }

    private Wallet getOrCreateCustomerWalletForUpdate(UUID customerId) {
        UUID walletId = UUID.randomUUID();
        if (isPostgreSql()) {
            jdbcTemplate.update("""
                    INSERT INTO wallets (
                        id, owner_type, owner_id, available_balance, pending_balance,
                        locked_balance, commission_debt, total_earned, total_withdrawn,
                        version, created_at, updated_at
                    ) VALUES (?, 'CUSTOMER', ?, 0, 0, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (owner_type, owner_id) DO NOTHING
                    """, walletId, customerId);
        } else {
            jdbcTemplate.update("""
                    MERGE INTO wallets AS target
                    USING (VALUES (?, ?)) AS source (id, owner_id)
                    ON target.owner_type = 'CUSTOMER' AND target.owner_id = source.owner_id
                    WHEN NOT MATCHED THEN INSERT (
                        id, owner_type, owner_id, available_balance, pending_balance,
                        locked_balance, commission_debt, total_earned, total_withdrawn,
                        version, created_at, updated_at
                    ) VALUES (source.id, 'CUSTOMER', source.owner_id, 0, 0, 0, 0, 0, 0, 0,
                              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """, walletId, customerId);
        }
        return walletRepository.findForUpdate(WalletOwnerType.CUSTOMER, customerId)
                .orElseThrow(() -> new IllegalStateException("Không thể khóa Customer Wallet"));
    }

    private void failIfAutomaticReconciliationIsUnsafe(UUID bookingId) {
        // Exposure is CURRENT, not event-time: a delayed command must never
        // credit after a later refund, cash settlement or revenue release.
        long unsafePayments = paymentRepository.countUnsafeRoomChangeExposure(
                bookingId,
                PaymentStatus.PAID,
                PaymentStatus.REFUNDED,
                PaymentMethod.CASH
        );
        boolean activeRefund = refundRequestRepository.existsByBookingIdAndStatusIn(
                bookingId, ACTIVE_REFUND_STATUSES
        );
        boolean externalTransfer = hotelCustomerTransferRepository.existsByBookingIdAndStatusIn(
                bookingId, EXTERNAL_TRANSFER_STATUSES
        );
        if (unsafePayments > 0 || activeRefund || externalTransfer) {
            throw new IllegalStateException(
                    "ROOM_CHANGE_RECONCILIATION_REQUIRED: booking có payment CASH, "
                            + "doanh thu đã giải ngân, khoản hoàn/transfer đã thực hiện "
                            + "hoặc yêu cầu hoàn tiền đang hoạt động; "
                            + "không được tự động cộng chênh lệch."
            );
        }
    }

    private int claim(RoomChangeFinancialCommand command) {
        Object[] values = {
                UUID.randomUUID(), OPERATION_TYPE, command.eventId(), command.bookingId(),
                command.customerId(), command.roomChangeVersion(), money(command.newWholeBookingTotal()),
                money(command.expectedNetRetainedAmount()),
                Timestamp.from(normalizeEventTime(command.occurredAt())), clean(command.correlationId()),
                Timestamp.from(Instant.now())
        };
        if (isPostgreSql()) {
            return jdbcTemplate.update("""
                    INSERT INTO financial_event_inbox (
                        id, operation_type, operation_id, booking_id, customer_id,
                        room_change_version, new_booking_total,
                        expected_net_retained_amount, occurred_at,
                        correlation_id, processed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT DO NOTHING
                    """, values);
        }
        try {
            return jdbcTemplate.update("""
                    MERGE INTO financial_event_inbox AS target
                    USING (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)) AS source (
                        id, operation_type, operation_id, booking_id, customer_id,
                        room_change_version, new_booking_total,
                        expected_net_retained_amount, occurred_at,
                        correlation_id, processed_at
                    )
                    ON target.operation_type = source.operation_type
                       AND target.operation_id = source.operation_id
                    WHEN NOT MATCHED THEN INSERT (
                        id, operation_type, operation_id, booking_id, customer_id,
                        room_change_version, new_booking_total,
                        expected_net_retained_amount, occurred_at,
                        correlation_id, processed_at
                    ) VALUES (
                        source.id, source.operation_type, source.operation_id,
                        source.booking_id, source.customer_id, source.room_change_version,
                        source.new_booking_total,
                        source.expected_net_retained_amount,
                        source.occurred_at, source.correlation_id, source.processed_at
                    )
                    """, values);
        } catch (DuplicateKeyException collision) {
            return 0;
        }
    }

    private static void requireNextVersion(
            RoomChangeFinancialCommand command,
            long lastProcessedVersion
    ) {
        long expected = Math.addExact(lastProcessedVersion, 1L);
        if (command.roomChangeVersion() == expected) return;
        if (command.roomChangeVersion() < expected) {
            throw new IllegalStateException(
                    "STALE_FINANCIAL_OPERATION: expected roomChangeVersion " + expected
                            + " nhưng nhận " + command.roomChangeVersion()
            );
        }
        throw new IllegalStateException(
                "FINANCIAL_OPERATION_SEQUENCE_GAP: expected roomChangeVersion " + expected
                        + " nhưng nhận " + command.roomChangeVersion()
        );
    }

    private boolean isPostgreSql() {
        String product = jdbcTemplate.execute((ConnectionCallback<String>) connection ->
                connection.getMetaData().getDatabaseProductName());
        if ("PostgreSQL".equalsIgnoreCase(product)) return true;
        if ("H2".equalsIgnoreCase(product)) return false;
        throw new IllegalStateException("Database chưa được kiểm chứng cho financial inbox: " + product);
    }

    private void verifySettledPaymentOwnership(
            UUID bookingId,
            UUID customerId,
            Instant settledAtOrBefore
    ) {
        List<UUID> owners = paymentRepository.findDistinctCustomerIdsByBookingIdAndStatusAtOrBefore(
                bookingId, PaymentStatus.PAID, settledAtOrBefore
        );
        if (owners.stream().anyMatch(owner -> !customerId.equals(owner))) {
            throw new IllegalStateException("Customer không sở hữu settled payment của booking");
        }
    }

    private static void validate(RoomChangeFinancialCommand command) {
        if (command == null) throw new IllegalArgumentException("Financial command không được để trống");
        validateIdentity(command.eventId(), "eventId");
        validateIdentity(command.roomChangeId(), "roomChangeId");
        if (command.roomChangeVersion() <= 0) {
            throw new IllegalArgumentException("roomChangeVersion phải lớn hơn 0");
        }
        validateIdentity(command.bookingId(), "bookingId");
        validateIdentity(command.customerId(), "customerId");
        if (!command.eventId().equals(command.roomChangeId())) {
            throw new IllegalArgumentException("eventId phải đồng nhất với immutable roomChangeId");
        }
        if (command.occurredAt() == null) throw new IllegalArgumentException("occurredAt không được để trống");
        if (command.newWholeBookingTotal() == null || command.newWholeBookingTotal().signum() < 0
                || command.newWholeBookingTotal().stripTrailingZeros().scale() > 0) {
            throw new IllegalArgumentException("newWholeBookingTotal phải là số VND nguyên không âm");
        }
        if (command.expectedNetRetainedAmount() == null
                || command.expectedNetRetainedAmount().signum() < 0
                || command.expectedNetRetainedAmount().stripTrailingZeros().scale() > 0) {
            throw new IllegalArgumentException(
                    "expectedNetRetainedAmount phải là số VND nguyên không âm"
            );
        }
    }

    private static void validateIdentity(UUID value, String name) {
        if (value == null) throw new IllegalArgumentException(name + " không được để trống");
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(0, RoundingMode.HALF_UP);
    }

    private static String clean(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static Instant normalizeEventTime(Instant value) {
        return value.truncatedTo(ChronoUnit.MICROS);
    }

    private static void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }

    private record InboxRow(
            UUID bookingId,
            UUID customerId,
            long roomChangeVersion,
            BigDecimal newTotal,
            BigDecimal expectedNetRetainedAmount,
            Instant occurredAt,
            BigDecimal validPaid,
            BigDecimal credited
    ) {}

}
