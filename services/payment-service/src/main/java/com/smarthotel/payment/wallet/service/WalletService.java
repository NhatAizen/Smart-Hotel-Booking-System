package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.integration.booking.BookingClient;
import com.smarthotel.payment.integration.notification.NotificationClient;
import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import com.smarthotel.payment.payos.PayOsPayoutClient;
import com.smarthotel.payment.wallet.dto.*;
import com.smarthotel.payment.wallet.entity.*;
import com.smarthotel.payment.wallet.repository.*;
import com.smarthotel.payment.wallet.exception.FinancialOperationException;
import com.smarthotel.payment.wallet.roomchange.BookingFinancialLockService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

@Service
public class WalletService {
    private final WalletRepository walletRepository;
    private final WalletTransactionRepository transactionRepository;
    private final WithdrawalRequestRepository withdrawalRepository;
    private final PaymentRepository paymentRepository;
    private final BookingClient bookingClient;
    private final PayOsPayoutClient payoutClient;
    private final NotificationClient notificationClient;
    private final HotelAdminDemotionFenceService hotelAdminDemotionFenceService;
    private final JdbcTemplate jdbcTemplate;
    private final BookingFinancialLockService bookingFinancialLockService;

    public WalletService(WalletRepository walletRepository,
                         WalletTransactionRepository transactionRepository,
                         WithdrawalRequestRepository withdrawalRepository,
                         PaymentRepository paymentRepository,
                         BookingClient bookingClient,
                         PayOsPayoutClient payoutClient,
                         NotificationClient notificationClient,
                         HotelAdminDemotionFenceService hotelAdminDemotionFenceService,
                         JdbcTemplate jdbcTemplate,
                         BookingFinancialLockService bookingFinancialLockService) {
        this.walletRepository = walletRepository;
        this.transactionRepository = transactionRepository;
        this.withdrawalRepository = withdrawalRepository;
        this.paymentRepository = paymentRepository;
        this.bookingClient = bookingClient;
        this.payoutClient = payoutClient;
        this.notificationClient = notificationClient;
        this.hotelAdminDemotionFenceService = hotelAdminDemotionFenceService;
        this.jdbcTemplate = jdbcTemplate;
        this.bookingFinancialLockService = bookingFinancialLockService;
    }

    @Transactional
    public void applySuccessfulPayment(Payment payment) {
        bookingFinancialLockService.lock(payment.getBookingId());
        if (payment.isWalletApplied()) return;
        requirePaidWithHotel(payment);
        hotelAdminDemotionFenceService.ensureOwnerMutationAllowed(payment.getHotelOwnerId());

        creditPlatformCommission(payment);

        /*
         * Online/WALLET payment luôn đi vào PENDING.
         * Không release ngay lúc thanh toán vì khoản này còn dùng để bảo đảm
         * refund cho customer cho tới khi booking CHECKED_OUT.
         */
        if (!transactionRepository.existsByPaymentIdAndType(
                payment.getId(),
                WalletTransactionType.HOTEL_REVENUE_PENDING
        ) && !transactionRepository.existsByPaymentIdAndType(
                payment.getId(),
                WalletTransactionType.HOTEL_REVENUE_RELEASED
        )) {
            Wallet hotel = getOrCreateForUpdate(
                    WalletOwnerType.HOTEL_ADMIN,
                    payment.getHotelOwnerId()
            );
            hotel.creditPending(payment.getHotelNetAmount());
            transactionRepository.save(new WalletTransaction(
                    hotel.getId(),
                    payment.getId(),
                    null,
                    WalletTransactionType.HOTEL_REVENUE_PENDING,
                    payment.getHotelNetAmount(),
                    "Doanh thu đang giữ từ booking " + payment.getBookingId()
            ));
        }

        payment.markWalletApplied();
    }

    @Transactional
    public void applyCashAtHotelPayment(Payment payment) {
        bookingFinancialLockService.lock(payment.getBookingId());
        if (payment.isWalletApplied()) return;
        requirePaidWithHotel(payment);
        hotelAdminDemotionFenceService.ensureOwnerMutationAllowed(payment.getHotelOwnerId());

        // All multi-wallet paths acquire PLATFORM before HOTEL/HOTEL_ADMIN
        // and CUSTOMER. Cash used to invert the platform/hotel order.
        getOrCreateForUpdate(WalletOwnerType.PLATFORM, Wallet.PLATFORM_OWNER_ID);
        Wallet hotel = getOrCreateForUpdate(
                WalletOwnerType.HOTEL_ADMIN,
                payment.getHotelOwnerId()
        );

        Wallet.CommissionCharge charge =
                hotel.chargeCommission(payment.getCommissionAmount());

        /*
         * Hotel đã nhận CASH ngoài hệ thống nên chỉ ghi nhận doanh thu.
         * Không cộng hotelNetAmount vào available/pending để tránh nhân đôi tiền.
         */
        hotel.recordExternalRevenue(payment.getHotelNetAmount());

        creditPlatformCommission(payment);

        if (charge.debitedFromAvailable().signum() > 0
                && !transactionRepository.existsByPaymentIdAndType(
                        payment.getId(),
                        WalletTransactionType.HOTEL_COMMISSION_DEBIT
                )) {
            transactionRepository.save(new WalletTransaction(
                    hotel.getId(),
                    payment.getId(),
                    null,
                    WalletTransactionType.HOTEL_COMMISSION_DEBIT,
                    charge.debitedFromAvailable().negate(),
                    "Đã khấu trừ hoa hồng từ số dư khả dụng cho booking tiền mặt "
                            + payment.getBookingId()
            ));
        }

        if (charge.debtAdded().signum() > 0
                && !transactionRepository.existsByPaymentIdAndType(
                        payment.getId(),
                        WalletTransactionType.HOTEL_COMMISSION_DEBT_ACCRUED
                )) {
            transactionRepository.save(new WalletTransaction(
                    hotel.getId(),
                    payment.getId(),
                    null,
                    WalletTransactionType.HOTEL_COMMISSION_DEBT_ACCRUED,
                    charge.debtAdded().negate(),
                    "Phát sinh công nợ hoa hồng booking tiền mặt "
                            + payment.getBookingId()
            ));
            notificationClient.sendUser(
                    payment.getHotelOwnerId(),
                    "Phát sinh công nợ hoa hồng",
                    "Booking tiền mặt " + payment.getBookingId()
                            + " phát sinh " + charge.debtAdded().toPlainString()
                            + " đ công nợ hoa hồng. Khoản này sẽ được tự cấn trừ "
                            + "khi có doanh thu được giải ngân hoặc khi nạp ví.",
                    "HOTEL_COMMISSION_DEBT",
                    "FINANCE",
                    "/hotel-admin/wallet"
            );
        }

        if (!transactionRepository.existsByPaymentIdAndType(
                payment.getId(),
                WalletTransactionType.CASH_REVENUE_RECORDED
        )) {
            transactionRepository.save(new WalletTransaction(
                    hotel.getId(),
                    payment.getId(),
                    null,
                    WalletTransactionType.CASH_REVENUE_RECORDED,
                    payment.getHotelNetAmount(),
                    "Doanh thu tiền mặt ngoài ví từ booking " + payment.getBookingId()
            ));
        }

        payment.markRevenueReleased();
        payment.markWalletApplied();
    }

    @Transactional
    public void ensureCustomerBalance(UUID customerId, BigDecimal amount) {
        Wallet wallet = getOrCreateForUpdate(WalletOwnerType.CUSTOMER, customerId);
        if (wallet.getAvailableBalance().compareTo(amount.setScale(0, RoundingMode.HALF_UP)) < 0) {
            throw new IllegalStateException("Số dư Ví Enziu không đủ để thanh toán");
        }
    }

    @Transactional
    public void applyCustomerWalletPayment(Payment payment) {
        bookingFinancialLockService.lock(payment.getBookingId());
        if (transactionRepository.existsByPaymentIdAndType(payment.getId(), WalletTransactionType.CUSTOMER_PAYMENT_DEBIT)) return;
        Wallet wallet = getOrCreateForUpdate(WalletOwnerType.CUSTOMER, payment.getCustomerId());
        wallet.spendAvailable(payment.getAmount());
        transactionRepository.save(new WalletTransaction(
                wallet.getId(), payment.getId(), null,
                WalletTransactionType.CUSTOMER_PAYMENT_DEBIT,
                payment.getAmount().negate(),
                "Thanh toán booking " + payment.getBookingId() + " bằng Ví Enziu"
        ));
    }

    @Transactional
    public void creditCustomerRefund(Payment payment) {
        assertNoRoomChangeCreditConflict(payment.getBookingId());
        if (transactionRepository.existsByPaymentIdAndType(payment.getId(), WalletTransactionType.CUSTOMER_REFUND_CREDIT)) return;
        Wallet wallet = getOrCreateForUpdate(WalletOwnerType.CUSTOMER, payment.getCustomerId());
        wallet.creditCustomerRefund(payment.getAmount());
        transactionRepository.save(new WalletTransaction(
                wallet.getId(), payment.getId(), null,
                WalletTransactionType.CUSTOMER_REFUND_CREDIT,
                payment.getAmount(),
                "Hoàn tiền booking " + payment.getBookingId() + " vào Ví Enziu"
        ));
        notificationClient.sendUser(
                payment.getCustomerId(),
                "Đã hoàn tiền vào Ví Enziu",
                "EnziuRooms đã hoàn " + payment.getAmount().toPlainString() + " đ vào ví của bạn.",
                "REFUND_TO_WALLET",
                "PAYMENT",
                "/customer/wallet"
        );
    }

    @Transactional
    public void applyWalletTopUp(UUID paymentOrderId, UUID ownerId, BigDecimal amount) {
        if (transactionRepository.existsByPaymentOrderIdAndType(paymentOrderId, WalletTransactionType.WALLET_TOP_UP)) return;
        Wallet wallet = getOrCreateForUpdate(WalletOwnerType.HOTEL_ADMIN, ownerId);
        BigDecimal debtSettled = wallet.topUpAvailable(amount);
        transactionRepository.save(WalletTransaction.forTopUp(
                wallet.getId(), paymentOrderId, amount,
                "Nạp tiền vào ví khách sạn qua PayOS"
        ));
        if (debtSettled.signum() > 0) {
            transactionRepository.save(new WalletTransaction(
                    wallet.getId(),
                    null,
                    null,
                    WalletTransactionType.HOTEL_COMMISSION_DEBT_SETTLED,
                    debtSettled.negate(),
                    "Cấn trừ công nợ hoa hồng từ tiền nạp ví"
            ));
        }
    }

    @Transactional
    public void reverseSuccessfulPayment(Payment payment) {
        assertNoRoomChangeCreditConflict(payment.getBookingId());
        if (!payment.isWalletApplied()) return;
        if (payment.getHotelOwnerId() == null) throw new IllegalStateException("Giao dịch chưa xác định được chủ khách sạn");

        Wallet platform = getOrCreateForUpdate(WalletOwnerType.PLATFORM, Wallet.PLATFORM_OWNER_ID);
        Wallet hotel = getOrCreateForUpdate(WalletOwnerType.HOTEL_ADMIN, payment.getHotelOwnerId());

        platform.debitAvailable(payment.getCommissionAmount());
        if (payment.getMethod() == PaymentMethod.CASH) {
            hotel.debitForRefund(payment.getHotelNetAmount());
        } else if (payment.isRevenueReleased()) {
            hotel.debitAvailable(payment.getHotelNetAmount());
        } else {
            hotel.debitPending(payment.getHotelNetAmount());
        }

        if (!transactionRepository.existsByPaymentIdAndType(payment.getId(), WalletTransactionType.REFUND_DEBIT)) {
            transactionRepository.save(new WalletTransaction(
                    platform.getId(), payment.getId(), null, WalletTransactionType.REFUND_DEBIT,
                    payment.getCommissionAmount().negate(),
                    "Hoàn hoa hồng cho booking " + payment.getBookingId()
            ));
            transactionRepository.save(new WalletTransaction(
                    hotel.getId(), payment.getId(), null, WalletTransactionType.REFUND_DEBIT,
                    payment.getHotelNetAmount().negate(),
                    "Hoàn doanh thu cho booking " + payment.getBookingId()
            ));
        }
    }

    @Transactional
    public Payment releaseHotelRevenue(UUID paymentId) {
        return releaseHotelRevenue(paymentId, false);
    }

    @Transactional
    public Payment releaseHotelRevenue(UUID paymentId, boolean force) {
        UUID bookingId = paymentRepository.findBookingIdById(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy giao dịch"));
        bookingFinancialLockService.lock(bookingId);

        Payment payment = paymentRepository.findForUpdateById(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy giao dịch"));
        if (!bookingId.equals(payment.getBookingId())) {
            throw new IllegalStateException("Booking của giao dịch đã thay đổi trong lúc khóa tài chính");
        }

        if (payment.getStatus() != PaymentStatus.PAID) {
            throw new IllegalStateException("Giao dịch chưa thanh toán thành công");
        }
        if (!payment.isWalletApplied()) {
            throw new IllegalStateException("Giao dịch chưa được hạch toán vào ví");
        }
        if (payment.isRevenueReleased()) {
            return payment;
        }
        if (payment.getMethod() == PaymentMethod.CASH) {
            return payment;
        }
        if (payment.getHotelOwnerId() == null) {
            throw new IllegalStateException("Thiếu chủ khách sạn");
        }
        assertNoRoomChangeCreditConflictWhileLocked(payment.getBookingId());
        hotelAdminDemotionFenceService.ensureOwnerMutationAllowed(payment.getHotelOwnerId());

        if (!force) {
            var booking = bookingClient.getBooking(payment.getBookingId());
            if (!"CHECKED_OUT".equalsIgnoreCase(booking.status())) {
                throw new IllegalStateException(
                        "Chỉ giải ngân sau khi khách đã checkout. "
                                + "Doanh thu hiện vẫn được giữ để bảo đảm hoàn tiền."
                );
            }
        }

        Wallet wallet = getOrCreateForUpdate(
                WalletOwnerType.HOTEL_ADMIN,
                payment.getHotelOwnerId()
        );

        Wallet.ReleaseResult release =
                wallet.releasePendingAndSettleCommissionDebt(
                        payment.getHotelNetAmount()
                );

        payment.markRevenueReleased();

        transactionRepository.save(new WalletTransaction(
                wallet.getId(),
                payment.getId(),
                null,
                WalletTransactionType.HOTEL_REVENUE_RELEASED,
                payment.getHotelNetAmount(),
                "Giải ngân doanh thu booking " + payment.getBookingId()
        ));

        if (release.debtSettled().signum() > 0) {
            transactionRepository.save(new WalletTransaction(
                    wallet.getId(),
                    payment.getId(),
                    null,
                    WalletTransactionType.HOTEL_COMMISSION_DEBT_SETTLED,
                    release.debtSettled().negate(),
                    "Cấn trừ công nợ hoa hồng khi giải ngân booking "
                            + payment.getBookingId()
            ));
        }

        notificationClient.sendUser(
                payment.getHotelOwnerId(),
                "Doanh thu đã được giải ngân",
                "Booking " + payment.getBookingId()
                        + " đã checkout. "
                        + release.creditedAvailable().toPlainString()
                        + " đ đã chuyển sang số dư khả dụng"
                        + (release.debtSettled().signum() > 0
                            ? ", sau khi cấn trừ "
                                + release.debtSettled().toPlainString()
                                + " đ công nợ hoa hồng."
                            : "."),
                "HOTEL_REVENUE_RELEASED",
                "FINANCE",
                "/hotel-admin/wallet"
        );

        return payment;
    }

    /**
     * V13 issues a real Customer-wallet credit but deliberately does not model a
     * partial reversal of the original payment allocation. Until that
     * counterparty reconciliation exists, an automatic full refund or hotel
     * revenue release would settle the same value twice. Fail closed and route
     * the affected booking to an audited manual reconciliation instead.
     */
    @Transactional
    public void assertNoRoomChangeCreditConflict(UUID bookingId) {
        if (bookingId == null) {
            throw new IllegalArgumentException("bookingId không được để trống");
        }
        bookingFinancialLockService.lock(bookingId);
        assertNoRoomChangeCreditConflictWhileLocked(bookingId);
    }

    /** Acquire every booking mutex before ANY wallet lock in a multi-booking checkout. */
    @Transactional
    public void lockBookings(java.util.Collection<UUID> bookingIds) {
        bookingIds.stream().distinct().sorted().forEach(bookingFinancialLockService::lock);
    }

    /** Platform is the common first lock for paths touching multiple wallets. */
    @Transactional
    public void lockCheckoutWallets(UUID hotelOwnerId) {
        getOrCreateForUpdate(WalletOwnerType.PLATFORM, Wallet.PLATFORM_OWNER_ID);
        getOrCreateForUpdate(WalletOwnerType.HOTEL_ADMIN, hotelOwnerId);
    }

    private void assertNoRoomChangeCreditConflictWhileLocked(UUID bookingId) {
        BigDecimal credited = jdbcTemplate.queryForObject("""
                SELECT COALESCE(SUM(credited_amount), 0)
                FROM financial_event_inbox
                WHERE operation_type = 'ROOM_CHANGE_CREDIT'
                  AND booking_id = ?
                  AND credited_amount > 0
                """, BigDecimal.class, bookingId);
        if (credited != null && credited.signum() > 0) {
            throw financial(
                    HttpStatus.CONFLICT,
                    "ROOM_CHANGE_RECONCILIATION_REQUIRED",
                    "Booking đã được cộng chênh lệch đổi phòng vào Ví Enziu; "
                            + "phải đối soát thủ công trước khi hoàn tiền hoặc giải ngân."
            );
        }
    }

    @Transactional(readOnly = true)
    public WalletResponse getWallet(UUID ownerId, WalletOwnerType ownerType) {
        return walletRepository.findByOwnerTypeAndOwnerId(ownerType, ownerId)
                .map(WalletResponse::from)
                .orElseGet(() -> emptyWallet(ownerId, ownerType));
    }

    @Transactional(readOnly = true)
    public List<WalletTransactionResponse> getTransactions(UUID ownerId, WalletOwnerType ownerType) {
        return walletRepository.findByOwnerTypeAndOwnerId(ownerType, ownerId)
                .map(wallet -> transactionRepository.findAllByWalletIdOrderByCreatedAtDesc(wallet.getId())
                        .stream().map(WalletTransactionResponse::from).toList())
                .orElse(List.of());
    }

    public WalletResponse getHotelWallet(UUID ownerId) { return getWallet(ownerId, WalletOwnerType.HOTEL_ADMIN); }
    public List<WalletTransactionResponse> getHotelTransactions(UUID ownerId) { return getTransactions(ownerId, WalletOwnerType.HOTEL_ADMIN); }

    @Transactional(readOnly = true)
    public WalletResponse getPlatformWallet() {
        return walletRepository.findByOwnerTypeAndOwnerId(WalletOwnerType.PLATFORM, Wallet.PLATFORM_OWNER_ID)
                .map(WalletResponse::from)
                .orElseGet(this::emptyPlatformWallet);
    }

    @Transactional(readOnly = true)
    public List<WalletTransactionResponse> getPlatformTransactions() {
        return walletRepository.findByOwnerTypeAndOwnerId(WalletOwnerType.PLATFORM, Wallet.PLATFORM_OWNER_ID)
                .map(wallet -> transactionRepository.findAllByWalletIdOrderByCreatedAtDesc(wallet.getId())
                        .stream().map(WalletTransactionResponse::from).toList())
                .orElse(List.of());
    }

    @Transactional
    public WithdrawalResponse createWithdrawal(UUID ownerId, WalletOwnerType ownerType, CreateWithdrawalRequest request) {
        return createWithdrawal(ownerId, ownerType, request, "legacy-" + UUID.randomUUID());
    }

    @Transactional
    public WithdrawalResponse createWithdrawal(
            UUID ownerId,
            WalletOwnerType ownerType,
            CreateWithdrawalRequest request,
            String idempotencyKey
    ) {
        if (ownerType != WalletOwnerType.HOTEL_ADMIN && ownerType != WalletOwnerType.CUSTOMER) {
            throw new IllegalArgumentException("Tài khoản này không hỗ trợ rút tiền");
        }
        if (ownerType == WalletOwnerType.HOTEL_ADMIN) {
            hotelAdminDemotionFenceService.ensureOwnerMutationAllowed(ownerId);
        }
        Wallet wallet = getOrCreateForUpdate(ownerType, ownerId);

        String normalizedKey = requireIdempotencyKey(idempotencyKey);
        var replay = withdrawalRepository.findByOwnerTypeAndOwnerIdAndIdempotencyKey(
                ownerType, ownerId, normalizedKey
        );
        if (replay.isPresent()) {
            WithdrawalRequest existing = replay.get();
            BigDecimal requested = request.amount().setScale(0, RoundingMode.HALF_UP);
            if (existing.getAmount().compareTo(requested) != 0
                    || !same(existing.getBankName(), request.bankName())
                    || !same(existing.getBankBin(), request.bankBin())
                    || !same(existing.getAccountNumber(), request.accountNumber())
                    || !same(existing.getAccountName(), request.accountName())) {
                throw financial(HttpStatus.CONFLICT, "DUPLICATE_FINANCIAL_OPERATION",
                        "Idempotency-Key đã dùng cho yêu cầu khác");
            }
            return WithdrawalResponse.from(existing);
        }

        if (ownerType == WalletOwnerType.HOTEL_ADMIN) {
            BigDecimal debtSettled = wallet.settleCommissionDebtFromAvailable();
            if (debtSettled.signum() > 0) {
                transactionRepository.save(new WalletTransaction(
                        wallet.getId(),
                        null,
                        null,
                        WalletTransactionType.HOTEL_COMMISSION_DEBT_SETTLED,
                        debtSettled.negate(),
                        "Cấn trừ công nợ hoa hồng trước khi tạo yêu cầu rút"
                ));
            }
        }

        BigDecimal amount = request.amount().setScale(0, RoundingMode.HALF_UP);
        BigDecimal balanceBefore = wallet.getAvailableBalance();
        try {
            wallet.holdForWithdrawal(amount);
        } catch (IllegalStateException exception) {
            if (ownerType == WalletOwnerType.CUSTOMER) {
                throw financial(HttpStatus.CONFLICT, "INSUFFICIENT_WALLET_BALANCE",
                        exception.getMessage());
            }
            throw exception;
        }
        WithdrawalRequest withdrawal = withdrawalRepository.save(new WithdrawalRequest(
                wallet.getId(), ownerId, ownerType, amount, request.bankName(), request.bankBin(),
                request.accountNumber(), request.accountName()
        ));
        withdrawal.assignIdempotencyKey(normalizedKey);
        transactionRepository.save(WalletTransaction.audited(
                wallet.getId(), withdrawal.getId(), WalletTransactionType.WITHDRAWAL_HOLD,
                amount.negate(), "Khóa tiền cho yêu cầu rút " + withdrawal.getId(),
                balanceBefore, wallet.getAvailableBalance(), "WITHDRAWAL",
                withdrawal.getId().toString(), "WITHDRAWAL_CREATE:" + ownerType + ":" + ownerId + ":" + normalizedKey,
                ownerType.name(), ownerId
        ));
        notificationClient.sendRole(
                "SYSTEM_ADMIN",
                "Có yêu cầu rút tiền mới",
                (ownerType == WalletOwnerType.CUSTOMER ? "Customer" : "Hotel Admin")
                        + " vừa tạo yêu cầu rút " + amount.toPlainString() + " đ.",
                "WITHDRAWAL_REQUEST", "FINANCE", "/admin/wallet"
        );
        return WithdrawalResponse.from(withdrawal);
    }

    @Transactional
    public WithdrawalResponse createHotelWithdrawal(
            UUID ownerId,
            BigDecimal requestedAmount,
            WithdrawalPayoutMethod payoutMethod,
            String bankName,
            String bankBin,
            String accountNumber,
            String accountName,
            MultipartFile qrImage
    ) {
        if (requestedAmount == null || requestedAmount.compareTo(new BigDecimal("10000")) < 0) {
            throw new IllegalArgumentException("Số tiền rút tối thiểu là 10.000 đ");
        }
        WithdrawalPayoutMethod method = payoutMethod == null
                ? WithdrawalPayoutMethod.BANK_ACCOUNT
                : payoutMethod;

        if (method.requiresBankAccount()) {
            requireText(bankName, "Vui lòng nhập tên ngân hàng thật");
            requireMaxLength(bankName, 120, "Tên ngân hàng tối đa 120 ký tự");
            requirePattern(bankBin, "\\d{6}", "Mã BIN ngân hàng phải gồm 6 chữ số");
            requirePattern(accountNumber, "[0-9]{6,30}", "Số tài khoản ngân hàng không hợp lệ");
            requireText(accountName, "Vui lòng nhập tên chủ tài khoản");
            requireMaxLength(accountName, 180, "Tên chủ tài khoản tối đa 180 ký tự");
        }

        StoredImage qr = readOptionalImage(qrImage, method.requiresQr(), "mã QR nhận tiền");

        hotelAdminDemotionFenceService.ensureOwnerMutationAllowed(ownerId);
        Wallet wallet = getOrCreateForUpdate(WalletOwnerType.HOTEL_ADMIN, ownerId);
        BigDecimal debtSettled = wallet.settleCommissionDebtFromAvailable();
        if (debtSettled.signum() > 0) {
            transactionRepository.save(new WalletTransaction(
                    wallet.getId(), null, null,
                    WalletTransactionType.HOTEL_COMMISSION_DEBT_SETTLED,
                    debtSettled.negate(),
                    "Cấn trừ công nợ hoa hồng trước khi tạo yêu cầu rút"
            ));
        }

        BigDecimal amount = requestedAmount.setScale(0, RoundingMode.HALF_UP);
        wallet.holdForWithdrawal(amount);
        WithdrawalRequest withdrawal = withdrawalRepository.save(new WithdrawalRequest(
                wallet.getId(), ownerId, WalletOwnerType.HOTEL_ADMIN, amount, method,
                bankName, bankBin, accountNumber, normalizeUpper(accountName),
                qr == null ? null : qr.data(),
                qr == null ? null : qr.contentType(),
                qr == null ? null : qr.fileName()
        ));
        transactionRepository.save(new WalletTransaction(
                wallet.getId(), null, withdrawal.getId(), WalletTransactionType.WITHDRAWAL_HOLD,
                amount.negate(), "Khóa tiền cho yêu cầu rút " + withdrawal.getId()
        ));
        notificationClient.sendRole(
                "SYSTEM_ADMIN",
                "Có yêu cầu rút tiền thật mới",
                "Hotel Admin vừa yêu cầu rút " + amount.toPlainString()
                        + " đ qua " + payoutMethodLabel(method) + ".",
                "WITHDRAWAL_REQUEST", "FINANCE", "/admin/wallet"
        );
        return WithdrawalResponse.from(withdrawal);
    }

    @Transactional(readOnly = true)
    public List<WithdrawalResponse> getMyWithdrawals(UUID ownerId, WalletOwnerType ownerType) {
        return withdrawalRepository.findAllByOwnerTypeAndOwnerIdOrderByRequestedAtDesc(ownerType, ownerId)
                .stream().map(WithdrawalResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<WithdrawalResponse> getAllWithdrawals(WithdrawalStatus status) {
        List<WithdrawalRequest> rows = status == null
                ? withdrawalRepository.findAllByOrderByRequestedAtDesc()
                : withdrawalRepository.findAllByStatusOrderByRequestedAtAsc(status);
        return rows.stream().map(WithdrawalResponse::fromAdmin).toList();
    }

    @Transactional(readOnly = true)
    public Page<WalletTransactionResponse> getTransactionsPage(
            UUID ownerId, WalletOwnerType ownerType, int page, int size
    ) {
        Pageable pageable = stablePage(page, size, "createdAt");
        return walletRepository.findByOwnerTypeAndOwnerId(ownerType, ownerId)
                .map(wallet -> transactionRepository.findAllByWalletId(wallet.getId(), pageable)
                        .map(WalletTransactionResponse::from))
                .orElse(Page.empty(pageable));
    }

    @Transactional(readOnly = true)
    public Page<WithdrawalResponse> getMyWithdrawalsPage(
            UUID ownerId, WalletOwnerType ownerType, int page, int size
    ) {
        return withdrawalRepository.findAllByOwnerTypeAndOwnerId(
                        ownerType, ownerId, stablePage(page, size, "requestedAt")
                )
                .map(WithdrawalResponse::from);
    }

    @Transactional(readOnly = true)
    public Page<WithdrawalResponse> getAllWithdrawalsPage(
            WithdrawalStatus status, int page, int size
    ) {
        Pageable pageable = stablePage(page, size, "requestedAt");
        Page<WithdrawalRequest> rows = status == null
                ? withdrawalRepository.findAll(pageable)
                : withdrawalRepository.findAllByStatus(status, pageable);
        return rows.map(WithdrawalResponse::fromAdmin);
    }

    @Transactional
    public WithdrawalResponse approve(UUID withdrawalId, UUID adminId, String note, boolean executePayout) {
        WithdrawalRequest withdrawal = findWithdrawalForUpdate(withdrawalId);
        if (executePayout && withdrawal.getOwnerType() == WalletOwnerType.CUSTOMER) {
            throw financial(HttpStatus.CONFLICT, "INVALID_WITHDRAWAL_STATUS",
                    "Customer withdrawal chỉ được System Admin đối soát và chuyển khoản thủ công"
            );
        }
        if (withdrawal.getStatus() != WithdrawalStatus.PENDING) {
            throw financial(HttpStatus.CONFLICT, "INVALID_WITHDRAWAL_STATUS",
                    "Chỉ yêu cầu PENDING mới có thể được duyệt");
        }
        withdrawal.approve(adminId, note);
        notifyWithdrawalOwner(withdrawal, "Yêu cầu rút tiền đã được duyệt",
                "Yêu cầu rút " + withdrawal.getAmount().toPlainString() + " đ đã được System Admin phê duyệt.");
        if (!executePayout) return WithdrawalResponse.fromAdmin(withdrawal);
        if (withdrawal.getPayoutMethod() != WithdrawalPayoutMethod.BANK_ACCOUNT
                && withdrawal.getPayoutMethod() != WithdrawalPayoutMethod.BANK_AND_QR) {
            throw new IllegalStateException("Yêu cầu chỉ có QR cá nhân nên không thể dùng chi hộ tự động");
        }
        if (!payoutClient.isConfigured()) {
            throw new IllegalStateException("Chưa cấu hình kênh chi hộ PayOS. Hãy duyệt không chuyển tự động hoặc đăng ký kênh chi hộ.");
        }
        try {
            String referenceId = "EZR-WD-" + withdrawal.getId().toString().replace("-", "").substring(0, 20);
            PayOsPayoutClient.PayoutResult result = payoutClient.createPayout(new PayOsPayoutClient.PayoutCommand(
                    referenceId,
                    withdrawal.getAmount().setScale(0, RoundingMode.HALF_UP).longValueExact(),
                    "Rut tien EnziuRooms",
                    withdrawal.getBankBin(),
                    withdrawal.getAccountNumber()
            ));
            String state = result.state() == null ? "PROCESSING" : result.state().toUpperCase();
            if (state.equals("SUCCEEDED") || state.equals("COMPLETED")) {
                completeWithdrawal(withdrawal, result.payoutId(), result.bankReference(), adminId);
            } else {
                withdrawal.markProcessing(result.payoutId(), result.referenceId());
            }
            return WithdrawalResponse.fromAdmin(withdrawal);
        } catch (RuntimeException exception) {
            Wallet wallet = walletRepository.findById(withdrawal.getWalletId())
                    .orElseThrow(() -> new IllegalStateException("Không tìm thấy ví"));
            wallet.releaseWithdrawalHold(withdrawal.getAmount());
            withdrawal.fail(exception.getMessage());
            transactionRepository.save(new WalletTransaction(
                    wallet.getId(), null, withdrawal.getId(), WalletTransactionType.WITHDRAWAL_RELEASED,
                    withdrawal.getAmount(), "Hoàn số dư do chi hộ thất bại"
            ));
            return WithdrawalResponse.fromAdmin(withdrawal);
        }
    }

    @Transactional
    public WithdrawalResponse reject(UUID withdrawalId, UUID adminId, String note) {
        WithdrawalRequest withdrawal = findWithdrawalForUpdate(withdrawalId);
        if (withdrawal.getStatus() != WithdrawalStatus.PENDING) {
            throw financial(HttpStatus.CONFLICT, "INVALID_WITHDRAWAL_STATUS",
                    "Chỉ yêu cầu PENDING mới có thể bị từ chối");
        }
        withdrawal.reject(adminId, note);
        Wallet wallet = walletRepository.findById(withdrawal.getWalletId())
                .orElseThrow(() -> new IllegalStateException("Không tìm thấy ví"));
        BigDecimal balanceBefore = wallet.getAvailableBalance();
        wallet.releaseWithdrawalHold(withdrawal.getAmount());
        transactionRepository.save(WalletTransaction.audited(
                wallet.getId(), withdrawal.getId(), WalletTransactionType.WITHDRAWAL_RELEASED,
                withdrawal.getAmount(), "Hoàn số dư do yêu cầu rút bị từ chối",
                balanceBefore, wallet.getAvailableBalance(), "WITHDRAWAL",
                withdrawal.getId().toString(), "WITHDRAWAL_REJECT:" + withdrawal.getId(),
                "SYSTEM_ADMIN", adminId
        ));
        notifyWithdrawalOwner(withdrawal, "Yêu cầu rút tiền bị từ chối",
                "Yêu cầu rút " + withdrawal.getAmount().toPlainString() + " đ chưa được chấp thuận. Lý do: " + note);
        return WithdrawalResponse.fromAdmin(withdrawal);
    }

    @Transactional
    public WithdrawalResponse markPaid(
            UUID withdrawalId,
            UUID adminId,
            String transferReference,
            MultipartFile transferProof,
            String idempotencyKey
    ) {
        WithdrawalRequest withdrawal = findWithdrawalForUpdate(withdrawalId);
        String normalizedKey = requireIdempotencyKey(idempotencyKey);
        if (withdrawal.getStatus() == WithdrawalStatus.PAID) {
            if (withdrawal.getCompletionIdempotencyKey() != null
                    && !withdrawal.getCompletionIdempotencyKey().equals(normalizedKey)) {
                throw financial(HttpStatus.CONFLICT, "DUPLICATE_FINANCIAL_OPERATION",
                        "Yêu cầu rút tiền đã hoàn tất bằng Idempotency-Key khác");
            }
            if (withdrawal.getPayoutReference() != null
                    && transferReference != null
                    && !withdrawal.getPayoutReference().equals(transferReference.trim())) {
                throw financial(HttpStatus.CONFLICT, "DUPLICATE_FINANCIAL_OPERATION",
                        "Payload hoàn tất không khớp lần xử lý trước");
            }
            return WithdrawalResponse.fromAdmin(withdrawal);
        }
        requireText(transferReference, "Vui lòng nhập mã giao dịch/chứng từ ngân hàng");
        StoredImage proof = readOptionalImage(transferProof, true, "ảnh chứng từ chuyển khoản");
        try {
            withdrawal.assignCompletionIdempotencyKey(normalizedKey);
        } catch (IllegalStateException exception) {
            throw financial(HttpStatus.CONFLICT, "DUPLICATE_FINANCIAL_OPERATION",
                    "Yêu cầu rút tiền đã dùng Idempotency-Key hoàn tất khác");
        }
        withdrawal.attachTransferProof(proof.data(), proof.contentType(), proof.fileName());
        completeWithdrawal(
                withdrawal, withdrawal.getPayoutId(), transferReference.trim(), adminId, normalizedKey
        );
        return WithdrawalResponse.fromAdmin(withdrawal);
    }

    @Transactional
    public WithdrawalResponse markPaid(
            UUID withdrawalId,
            UUID adminId,
            String transferReference,
            MultipartFile transferProof
    ) {
        return markPaid(
                withdrawalId, adminId, transferReference, transferProof,
                "legacy-completion-" + withdrawalId
        );
    }

    @Transactional(readOnly = true)
    public WithdrawalMedia getReceiverQr(
            UUID withdrawalId,
            UUID viewerId,
            WalletOwnerType viewerOwnerType,
            boolean systemAdmin
    ) {
        WithdrawalRequest withdrawal = withdrawalRepository.findById(withdrawalId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy yêu cầu rút tiền"));
        ensureCanViewMedia(withdrawal, viewerId, viewerOwnerType, systemAdmin);
        if (!withdrawal.hasReceiverQr()) {
            throw new IllegalArgumentException("Yêu cầu rút tiền này không có mã QR nhận tiền");
        }
        return new WithdrawalMedia(
                withdrawal.getReceiverQrData(),
                withdrawal.getReceiverQrContentType(),
                withdrawal.getReceiverQrFileName()
        );
    }

    @Transactional(readOnly = true)
    public WithdrawalMedia getTransferProof(
            UUID withdrawalId,
            UUID viewerId,
            WalletOwnerType viewerOwnerType,
            boolean systemAdmin
    ) {
        WithdrawalRequest withdrawal = withdrawalRepository.findById(withdrawalId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy yêu cầu rút tiền"));
        ensureCanViewMedia(withdrawal, viewerId, viewerOwnerType, systemAdmin);
        if (!withdrawal.hasTransferProof()) {
            throw new IllegalArgumentException("Yêu cầu rút tiền này chưa có chứng từ chuyển khoản");
        }
        return new WithdrawalMedia(
                withdrawal.getTransferProofData(),
                withdrawal.getTransferProofContentType(),
                withdrawal.getTransferProofFileName()
        );
    }

    private void completeWithdrawal(WithdrawalRequest withdrawal, String payoutId, String reference, UUID adminId) {
        completeWithdrawal(withdrawal, payoutId, reference, adminId,
                "automatic-payout-" + withdrawal.getId());
    }

    private void completeWithdrawal(
            WithdrawalRequest withdrawal,
            String payoutId,
            String reference,
            UUID adminId,
            String idempotencyKey
    ) {
        if (withdrawal.getStatus() == WithdrawalStatus.PAID) return;
        if (withdrawal.getStatus() != WithdrawalStatus.APPROVED
                && withdrawal.getStatus() != WithdrawalStatus.PROCESSING) {
            throw financial(HttpStatus.CONFLICT, "INVALID_WITHDRAWAL_STATUS",
                    "Yêu cầu rút tiền chưa sẵn sàng để hoàn tất");
        }
        Wallet wallet = walletRepository.findById(withdrawal.getWalletId())
                .orElseThrow(() -> new IllegalStateException("Không tìm thấy ví"));
        BigDecimal balanceBefore = wallet.getLockedBalance();
        wallet.completeWithdrawal(withdrawal.getAmount());
        withdrawal.markPaid(payoutId, reference, adminId);
        transactionRepository.save(WalletTransaction.audited(
                wallet.getId(), withdrawal.getId(), WalletTransactionType.WITHDRAWAL_PAID,
                withdrawal.getAmount().negate(),
                "System Admin đã xác nhận chuyển tiền thật. Mã giao dịch: " + reference,
                balanceBefore, wallet.getLockedBalance(), "WITHDRAWAL",
                withdrawal.getId().toString(), "WITHDRAWAL_COMPLETE:" + idempotencyKey,
                "SYSTEM_ADMIN", adminId
        ));
        notifyWithdrawalOwner(withdrawal, "Tiền rút đã được chuyển",
                "System Admin đã xác nhận chuyển thật " + withdrawal.getAmount().toPlainString()
                        + " đ. Mã giao dịch: " + reference + ".");
    }

    private void ensureCanViewMedia(
            WithdrawalRequest withdrawal,
            UUID viewerId,
            WalletOwnerType viewerOwnerType,
            boolean systemAdmin
    ) {
        if (systemAdmin) return;
        if (viewerId == null
                || viewerOwnerType == null
                || !withdrawal.getOwnerId().equals(viewerId)
                || withdrawal.getOwnerType() != viewerOwnerType) {
            throw new IllegalStateException("Bạn không có quyền xem tài liệu rút tiền này");
        }
    }

    private StoredImage readOptionalImage(MultipartFile file, boolean required, String label) {
        if (file == null || file.isEmpty()) {
            if (required) throw new IllegalArgumentException("Vui lòng tải " + label);
            return null;
        }
        if (file.getSize() > 5L * 1024L * 1024L) {
            throw new IllegalArgumentException("Ảnh " + label + " tối đa 5MB");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (!contentType.equals("image/png")
                && !contentType.equals("image/jpeg")
                && !contentType.equals("image/webp")) {
            throw new IllegalArgumentException("Ảnh " + label + " chỉ hỗ trợ PNG, JPG/JPEG hoặc WEBP");
        }
        try {
            return new StoredImage(file.getBytes(), contentType, safeFileName(file.getOriginalFilename()));
        } catch (IOException exception) {
            throw new IllegalStateException("Không thể đọc " + label, exception);
        }
    }

    private void requireText(String value, String message) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(message);
    }

    private void requirePattern(String value, String pattern, String message) {
        requireText(value, message);
        if (!value.trim().matches(pattern)) throw new IllegalArgumentException(message);
    }

    private void requireMaxLength(String value, int max, String message) {
        if (value != null && value.trim().length() > max) throw new IllegalArgumentException(message);
    }

    private String normalizeUpper(String value) {
        return value == null ? null : value.trim().toUpperCase();
    }

    private String safeFileName(String value) {
        if (value == null || value.isBlank()) return "image";
        String cleaned = value.replace('\\', '/');
        int index = cleaned.lastIndexOf('/');
        return (index >= 0 ? cleaned.substring(index + 1) : cleaned).replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private String payoutMethodLabel(WithdrawalPayoutMethod method) {
        return switch (method) {
            case BANK_ACCOUNT -> "tài khoản ngân hàng";
            case PERSONAL_QR -> "mã QR cá nhân";
            case BANK_AND_QR -> "tài khoản ngân hàng + mã QR cá nhân";
        };
    }

    private record StoredImage(byte[] data, String contentType, String fileName) {}

    private void notifyWithdrawalOwner(WithdrawalRequest withdrawal, String title, String message) {
        String actionUrl = withdrawal.getOwnerType() == WalletOwnerType.CUSTOMER
                ? "/customer/wallet" : "/hotel-admin/wallet";
        notificationClient.sendUser(withdrawal.getOwnerId(), title, message,
                "WITHDRAWAL_STATUS", "FINANCE", actionUrl);
    }

    private void creditPlatformCommission(Payment payment) {
        if (transactionRepository.existsByPaymentIdAndType(payment.getId(), WalletTransactionType.PLATFORM_COMMISSION)) return;
        Wallet platform = getOrCreateForUpdate(WalletOwnerType.PLATFORM, Wallet.PLATFORM_OWNER_ID);
        platform.creditAvailable(payment.getCommissionAmount());
        transactionRepository.save(new WalletTransaction(
                platform.getId(), payment.getId(), null,
                WalletTransactionType.PLATFORM_COMMISSION,
                payment.getCommissionAmount(),
                "Hoa hồng từ booking " + payment.getBookingId()
        ));
    }

    private void requirePaidWithHotel(Payment payment) {
        if (payment.getStatus() != PaymentStatus.PAID) throw new IllegalStateException("Chỉ giao dịch PAID mới được hạch toán vào ví");
        if (payment.getHotelOwnerId() == null) throw new IllegalStateException("Giao dịch chưa xác định được chủ khách sạn");
    }

    private WithdrawalRequest findWithdrawalForUpdate(UUID id) {
        return withdrawalRepository.findForUpdate(id)
                .orElseThrow(() -> financial(HttpStatus.NOT_FOUND, "WITHDRAWAL_NOT_FOUND",
                        "Không tìm thấy yêu cầu rút tiền"));
    }

    private Wallet getOrCreateForUpdate(WalletOwnerType type, UUID ownerId) {
        insertWalletIfAbsent(type, ownerId);
        return walletRepository.findForUpdate(type, ownerId)
                .orElseThrow(() -> new IllegalStateException("Không thể khóa ví"));
    }

    private void insertWalletIfAbsent(WalletOwnerType type, UUID ownerId) {
        UUID walletId = UUID.randomUUID();
        String product = jdbcTemplate.execute((ConnectionCallback<String>) connection ->
                connection.getMetaData().getDatabaseProductName());
        if ("PostgreSQL".equalsIgnoreCase(product)) {
            jdbcTemplate.update("""
                    INSERT INTO wallets
                        (id, owner_type, owner_id, available_balance, pending_balance,
                         locked_balance, commission_debt, total_earned, total_withdrawn,
                         version, created_at, updated_at)
                    VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (owner_type, owner_id) DO NOTHING
                    """, walletId, type.name(), ownerId);
            return;
        }
        if ("H2".equalsIgnoreCase(product)) {
            jdbcTemplate.update("""
                    MERGE INTO wallets AS target
                    USING (VALUES (?, ?, ?)) AS source (id, owner_type, owner_id)
                    ON target.owner_type = source.owner_type AND target.owner_id = source.owner_id
                    WHEN NOT MATCHED THEN INSERT
                        (id, owner_type, owner_id, available_balance, pending_balance,
                         locked_balance, commission_debt, total_earned, total_withdrawn,
                         version, created_at, updated_at)
                        VALUES (source.id, source.owner_type, source.owner_id, 0, 0, 0,
                                0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """, walletId, type.name(), ownerId);
            return;
        }
        throw new IllegalStateException("Database chưa được kiểm chứng cho wallet locking: " + product);
    }

    private static Pageable stablePage(int page, int size, String timeProperty) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(100, Math.max(1, size));
        return PageRequest.of(safePage, safeSize,
                Sort.by(Sort.Order.desc(timeProperty), Sort.Order.desc("id")));
    }

    private static String requireIdempotencyKey(String value) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("Idempotency-Key không được để trống");
        }
        String normalized = value.trim();
        if (normalized.length() > 120) {
            throw new IllegalArgumentException("Idempotency-Key tối đa 120 ký tự");
        }
        return normalized;
    }

    private static boolean same(String left, String right) {
        String a = left == null ? null : left.trim();
        String b = right == null ? null : right.trim();
        return java.util.Objects.equals(a, b);
    }

    private static FinancialOperationException financial(
            HttpStatus status, String code, String message
    ) {
        return new FinancialOperationException(status, code, message);
    }

    private WalletResponse emptyWallet(UUID ownerId, WalletOwnerType ownerType) {
        BigDecimal zero = BigDecimal.ZERO.setScale(0, RoundingMode.HALF_UP);
        return new WalletResponse(
                null, ownerType, ownerId,
                zero, zero, zero, zero, zero, zero,
                null, null
        );
    }

    private WalletResponse emptyPlatformWallet() {
        return emptyWallet(Wallet.PLATFORM_OWNER_ID, WalletOwnerType.PLATFORM);
    }
}
