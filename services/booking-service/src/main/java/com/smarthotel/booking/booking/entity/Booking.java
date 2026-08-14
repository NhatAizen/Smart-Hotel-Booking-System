package com.smarthotel.booking.booking.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name = "bookings")
public class Booking {

    protected Booking() {
    }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "booking_group_id")
    private UUID bookingGroupId;

    @Column(name = "booking_code", nullable = false, unique = true, length = 40)
    private String bookingCode;

    @Column(name = "check_in_code", nullable = false, unique = true, length = 100)
    private String checkInCode;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "hotel_id", nullable = false)
    private UUID hotelId;

    @Column(name = "room_type_id")
    private UUID roomTypeId;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Column(name = "check_in", nullable = false)
    private LocalDate checkIn;

    @Column(name = "check_out", nullable = false)
    private LocalDate checkOut;

    @Column(name = "guest_count", nullable = false)
    private Integer guestCount;

    @Column(name = "adults", nullable = false)
    private Integer adults;

    @Column(name = "children", nullable = false)
    private Integer children;

    @Column(name = "total_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalPrice;

    @Column(name = "base_accommodation_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal baseAccommodationAmount;

    @Column(name = "weekend_surcharge_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal weekendSurchargeAmount;

    @Column(name = "special_date_surcharge_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal specialDateSurchargeAmount;

    @Column(name = "late_checkout_fee", nullable = false, precision = 14, scale = 2)
    private BigDecimal lateCheckoutFee;

    @Column(name = "late_fee_assessed_at")
    private Instant lateFeeAssessedAt;

    @Column(name = "paid_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal paidAmount;

    @Column(name = "remaining_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal remainingAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_option", nullable = false, length = 30)
    private PaymentOption paymentOption;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false, length = 30)
    private BookingPaymentStatus paymentStatus;

    @Column(name = "deposit_percent")
    private Integer depositPercent;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private BookingStatus status;

    @Column(name = "booker_first_name", length = 100)
    private String bookerFirstName;

    @Column(name = "booker_last_name", length = 100)
    private String bookerLastName;

    @Column(name = "booker_email", length = 255)
    private String bookerEmail;

    @Column(name = "booker_phone", length = 30)
    private String bookerPhone;

    @Column(name = "booker_is_guest", nullable = false)
    private boolean bookerIsGuest;

    @Column(name = "guest_first_name", length = 100)
    private String guestFirstName;

    @Column(name = "guest_last_name", length = 100)
    private String guestLastName;

    @Column(name = "guest_phone", length = 30)
    private String guestPhone;

    @Column(name = "special_request", length = 1000)
    private String specialRequest;

    @Column(name = "invoice_requested", nullable = false)
    private boolean invoiceRequested;

    @Column(name = "invoice_company_name", length = 255)
    private String invoiceCompanyName;

    @Column(name = "invoice_tax_code", length = 50)
    private String invoiceTaxCode;

    @Column(name = "invoice_address", length = 500)
    private String invoiceAddress;

    @Column(name = "invoice_email", length = 255)
    private String invoiceEmail;

    @Column(name = "terms_accepted", nullable = false)
    private boolean termsAccepted;

    @Column(name = "payment_expires_at")
    private Instant paymentExpiresAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "checked_in_at")
    private Instant checkedInAt;

    @Column(name = "checked_out_at")
    private Instant checkedOutAt;

    @Column(name = "customer_hidden", nullable = false)
    private boolean customerHidden;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Booking(
            UUID bookingGroupId,
            UUID customerId,
            UUID hotelId,
            UUID roomTypeId,
            UUID roomId,
            LocalDate checkIn,
            LocalDate checkOut,
            Integer adults,
            Integer children,
            BigDecimal totalPrice,
            PaymentOption paymentOption,
            Integer depositPercent,
            Instant holdExpiresAt,
            String bookerFirstName,
            String bookerLastName,
            String bookerEmail,
            String bookerPhone,
            boolean bookerIsGuest,
            String guestFirstName,
            String guestLastName,
            String guestPhone,
            String specialRequest,
            boolean invoiceRequested,
            String invoiceCompanyName,
            String invoiceTaxCode,
            String invoiceAddress,
            String invoiceEmail,
            boolean termsAccepted
    ) {
        Instant now = Instant.now();

        this.id = UUID.randomUUID();
        this.bookingGroupId = bookingGroupId;
        this.bookingCode = generateBookingCode(now);
        this.checkInCode = "ENZIU-CHECKIN:" + UUID.randomUUID();
        this.customerId = customerId;
        this.hotelId = hotelId;
        this.roomTypeId = roomTypeId;
        this.roomId = roomId;
        this.checkIn = checkIn;
        this.checkOut = checkOut;
        this.adults = adults;
        this.children = children;
        this.guestCount = Math.max(1, adults + children);
        this.totalPrice = money(totalPrice);
        this.baseAccommodationAmount = this.totalPrice;
        this.weekendSurchargeAmount = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        this.specialDateSurchargeAmount = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        this.lateCheckoutFee = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        this.lateFeeAssessedAt = null;
        this.paidAmount = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        this.remainingAmount = this.totalPrice;
        this.paymentOption = paymentOption;
        this.paymentStatus = BookingPaymentStatus.UNPAID;
        this.depositPercent = paymentOption == PaymentOption.DEPOSIT
                ? depositPercent
                : null;
        this.status = paymentOption == PaymentOption.PAY_AT_HOTEL
                ? BookingStatus.CONFIRMED
                : BookingStatus.PENDING_PAYMENT;
        this.paymentExpiresAt = paymentOption == PaymentOption.PAY_AT_HOTEL
                ? null
                : (holdExpiresAt != null ? holdExpiresAt : now.plusSeconds(10 * 60L));
        this.bookerFirstName = normalize(bookerFirstName);
        this.bookerLastName = normalize(bookerLastName);
        this.bookerEmail = normalizeEmail(bookerEmail);
        this.bookerPhone = normalize(bookerPhone);
        this.bookerIsGuest = bookerIsGuest;
        this.guestFirstName = bookerIsGuest ? this.bookerFirstName : normalize(guestFirstName);
        this.guestLastName = bookerIsGuest ? this.bookerLastName : normalize(guestLastName);
        this.guestPhone = bookerIsGuest ? this.bookerPhone : normalize(guestPhone);
        this.specialRequest = normalizeNullable(specialRequest);
        this.invoiceRequested = invoiceRequested;
        this.invoiceCompanyName = invoiceRequested ? normalize(invoiceCompanyName) : null;
        this.invoiceTaxCode = invoiceRequested ? normalize(invoiceTaxCode) : null;
        this.invoiceAddress = invoiceRequested ? normalize(invoiceAddress) : null;
        this.invoiceEmail = invoiceRequested ? normalizeEmail(invoiceEmail) : null;
        this.termsAccepted = termsAccepted;
        this.customerHidden = false;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void applyPricingBreakdown(
            BigDecimal baseAccommodationAmount,
            BigDecimal weekendSurchargeAmount,
            BigDecimal specialDateSurchargeAmount
    ) {
        if (paidAmount != null && paidAmount.signum() > 0) {
            throw new IllegalStateException("Không thể thay đổi giá gốc sau khi booking đã thanh toán");
        }
        this.baseAccommodationAmount = money(baseAccommodationAmount);
        this.weekendSurchargeAmount = money(weekendSurchargeAmount);
        this.specialDateSurchargeAmount = money(specialDateSurchargeAmount);
        this.lateCheckoutFee = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        this.lateFeeAssessedAt = null;
        this.totalPrice = money(
                this.baseAccommodationAmount
                        .add(this.weekendSurchargeAmount)
                        .add(this.specialDateSurchargeAmount)
        );
        this.remainingAmount = this.totalPrice;
        this.updatedAt = Instant.now();
    }

    public void assessLateCheckoutFee(BigDecimal fee, Instant assessedAt) {
        ensureStatus(BookingStatus.CHECKED_IN);
        if (lateFeeAssessedAt != null) {
            return;
        }

        BigDecimal normalizedFee = money(fee == null ? BigDecimal.ZERO : fee);
        if (normalizedFee.signum() < 0) {
            throw new IllegalArgumentException("Phí trả phòng trễ không được âm");
        }

        this.lateCheckoutFee = normalizedFee;
        this.lateFeeAssessedAt = assessedAt != null ? assessedAt : Instant.now();
        this.totalPrice = money(
                this.baseAccommodationAmount
                        .add(this.weekendSurchargeAmount)
                        .add(this.specialDateSurchargeAmount)
                        .add(this.lateCheckoutFee)
        );
        this.remainingAmount = money(this.totalPrice.subtract(this.paidAmount).max(BigDecimal.ZERO));

        if (this.remainingAmount.signum() == 0) {
            this.paymentStatus = BookingPaymentStatus.PAID;
        } else if (this.paidAmount.signum() > 0) {
            this.paymentStatus = BookingPaymentStatus.PARTIALLY_PAID;
        } else {
            this.paymentStatus = BookingPaymentStatus.UNPAID;
        }
        this.updatedAt = Instant.now();
    }

    public BigDecimal getPaymentDueAmount() {
        if (paymentOption == PaymentOption.PAY_AT_HOTEL) {
            return remainingAmount.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        }

        if (paymentOption == PaymentOption.DEPOSIT
                && paidAmount.signum() == 0) {
            return totalPrice
                    .multiply(BigDecimal.valueOf(depositPercent))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }

        return remainingAmount.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    public void confirm() {
        if (status == BookingStatus.CONFIRMED) {
            return;
        }
        if (status != BookingStatus.PENDING && status != BookingStatus.PENDING_PAYMENT) {
            throw new IllegalStateException("Booking không thể được xác nhận ở trạng thái " + status);
        }
        this.status = BookingStatus.CONFIRMED;
        this.paymentExpiresAt = null;
        this.updatedAt = Instant.now();
    }

    public void applyPayment(BigDecimal amount, BookingPaymentType paymentType) {
        if (status == BookingStatus.CANCELLED) {
            throw new IllegalStateException("Booking đã bị hủy");
        }
        if (status == BookingStatus.CHECKED_OUT) {
            throw new IllegalStateException("Booking đã trả phòng, không thể ghi nhận thêm thanh toán");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("Số tiền thanh toán phải lớn hơn 0");
        }

        // Webhook PayOS có thể được gửi lại nhiều lần. Nếu khoản tiền tương ứng
        // đã được ghi nhận thì trả về ngay để API nội bộ có tính idempotent.
        if (paymentType == BookingPaymentType.DEPOSIT
                && paymentOption == PaymentOption.DEPOSIT
                && (paymentStatus == BookingPaymentStatus.PARTIALLY_PAID
                    || paymentStatus == BookingPaymentStatus.PAID)
                && paidAmount.signum() > 0) {
            return;
        }
        if ((paymentType == BookingPaymentType.FULL_PAYMENT
                || paymentType == BookingPaymentType.REMAINING_PAYMENT)
                && paymentStatus == BookingPaymentStatus.PAID
                && remainingAmount.signum() == 0) {
            return;
        }
        if (paymentExpiresAt != null
                && Instant.now().isAfter(paymentExpiresAt)
                && status == BookingStatus.PENDING_PAYMENT) {
            cancel();
            throw new IllegalStateException("Thời gian giữ phòng đã hết");
        }

        BigDecimal normalizedAmount = money(amount);
        BigDecimal expected = getPaymentDueAmount();
        if (normalizedAmount.compareTo(expected) != 0) {
            throw new IllegalArgumentException(
                    "Số tiền thanh toán không hợp lệ. Cần thanh toán " + expected
            );
        }

        if (paymentType == BookingPaymentType.DEPOSIT
                && paymentOption != PaymentOption.DEPOSIT) {
            throw new IllegalArgumentException("Booking không sử dụng phương thức đặt cọc");
        }
        if (paymentType == BookingPaymentType.FULL_PAYMENT
                && paymentOption != PaymentOption.FULL_PAYMENT) {
            throw new IllegalArgumentException("Booking không sử dụng phương thức thanh toán toàn bộ");
        }

        this.paidAmount = money(this.paidAmount.add(normalizedAmount));
        if (this.paidAmount.compareTo(this.totalPrice) > 0) {
            this.paidAmount = this.totalPrice;
        }
        this.remainingAmount = money(this.totalPrice.subtract(this.paidAmount));
        this.paymentStatus = this.remainingAmount.signum() == 0
                ? BookingPaymentStatus.PAID
                : BookingPaymentStatus.PARTIALLY_PAID;
        // Thanh toán phí trả phòng trễ diễn ra khi khách đang CHECKED_IN.
        // Không được kéo booking ngược về CONFIRMED.
        if (this.status != BookingStatus.CHECKED_IN) {
            this.status = BookingStatus.CONFIRMED;
        }
        this.paymentExpiresAt = null;
        this.updatedAt = Instant.now();
    }

    public void markPaymentFailed() {
        if (status == BookingStatus.PENDING_PAYMENT) {
            this.paymentStatus = BookingPaymentStatus.FAILED;
            this.updatedAt = Instant.now();
        }
    }

    public void markCollectedAtHotel() {
        ensureStatus(BookingStatus.CONFIRMED);
        if (remainingAmount.signum() <= 0 || paymentStatus == BookingPaymentStatus.PAID) {
            return;
        }

        this.paidAmount = this.totalPrice;
        this.remainingAmount = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        this.paymentStatus = BookingPaymentStatus.PAID;
        this.paymentExpiresAt = null;
        this.updatedAt = Instant.now();
    }

    public void checkIn() {
        ensureStatus(BookingStatus.CONFIRMED);
        if (paymentStatus != BookingPaymentStatus.PAID
                || remainingAmount.signum() > 0) {
            throw new IllegalStateException(
                    "Booking chưa thanh toán đủ nên chưa thể nhận phòng"
            );
        }
        Instant now = Instant.now();
        this.status = BookingStatus.CHECKED_IN;
        this.checkedInAt = now;
        this.updatedAt = now;
    }

    public void checkOut() {
        ensureStatus(BookingStatus.CHECKED_IN);
        if (remainingAmount.signum() > 0 || paymentStatus != BookingPaymentStatus.PAID) {
            throw new IllegalStateException(
                    "Booking còn " + remainingAmount.stripTrailingZeros().toPlainString()
                            + " ₫ chưa thanh toán nên chưa thể trả phòng"
            );
        }
        Instant now = Instant.now();
        this.status = BookingStatus.CHECKED_OUT;
        this.checkedOutAt = now;
        this.updatedAt = now;
    }

    public void cancel() {
        if (status == BookingStatus.CANCELLED) {
            return;
        }
        if (status == BookingStatus.CHECKED_IN || status == BookingStatus.CHECKED_OUT) {
            throw new IllegalStateException(
                    "Không thể hủy booking đã nhận phòng hoặc trả phòng"
            );
        }
        this.status = BookingStatus.CANCELLED;
        this.cancelledAt = Instant.now();
        this.paymentExpiresAt = null;
        this.updatedAt = Instant.now();
    }

    public void markRefunded() {
        this.paymentStatus = BookingPaymentStatus.REFUNDED;
        cancel();
    }

    public void hideFromCustomer(UUID requestingCustomerId) {
        if (requestingCustomerId == null || !customerId.equals(requestingCustomerId)) {
            throw new IllegalStateException("Bạn không có quyền ẩn booking này");
        }
        if (status != BookingStatus.CANCELLED && status != BookingStatus.CHECKED_OUT) {
            throw new IllegalStateException(
                    "Chỉ có thể ẩn booking đã hủy hoặc đã hoàn tất"
            );
        }
        this.customerHidden = true;
        this.updatedAt = Instant.now();
    }

    private void ensureStatus(BookingStatus expected) {
        if (status != expected) {
            throw new IllegalStateException(
                    "Trạng thái booking không hợp lệ. Cần " + expected + " nhưng hiện tại là " + status
            );
        }
    }

    private static BigDecimal money(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static String generateBookingCode(Instant now) {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd")
                .withZone(ZoneOffset.UTC)
                .format(now);
        String suffix = UUID.randomUUID().toString()
                .replace("-", "")
                .substring(0, 8)
                .toUpperCase(Locale.ROOT);
        return "EZR-" + date + "-" + suffix;
    }

    private static String normalize(String value) {
        return value == null ? null : value.trim();
    }

    private static String normalizeNullable(String value) {
        String normalized = normalize(value);
        return normalized == null || normalized.isBlank() ? null : normalized;
    }

    private static String normalizeEmail(String value) {
        String normalized = normalize(value);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT);
    }

    public UUID getId() { return id; }
    public UUID getBookingGroupId() { return bookingGroupId; }
    public String getBookingCode() { return bookingCode; }
    public String getCheckInCode() { return checkInCode; }
    public UUID getCustomerId() { return customerId; }
    public UUID getHotelId() { return hotelId; }
    public UUID getRoomTypeId() { return roomTypeId; }
    public UUID getRoomId() { return roomId; }
    public LocalDate getCheckIn() { return checkIn; }
    public LocalDate getCheckOut() { return checkOut; }
    public Integer getGuestCount() { return guestCount; }
    public Integer getAdults() { return adults; }
    public Integer getChildren() { return children; }
    public BigDecimal getTotalPrice() { return totalPrice; }
    public BigDecimal getBaseAccommodationAmount() { return baseAccommodationAmount; }
    public BigDecimal getWeekendSurchargeAmount() { return weekendSurchargeAmount; }
    public BigDecimal getSpecialDateSurchargeAmount() { return specialDateSurchargeAmount; }
    public BigDecimal getLateCheckoutFee() { return lateCheckoutFee; }
    public Instant getLateFeeAssessedAt() { return lateFeeAssessedAt; }
    public BigDecimal getPaidAmount() { return paidAmount; }
    public BigDecimal getRemainingAmount() { return remainingAmount; }
    public PaymentOption getPaymentOption() { return paymentOption; }
    public BookingPaymentStatus getPaymentStatus() { return paymentStatus; }
    public Integer getDepositPercent() { return depositPercent; }
    public BookingStatus getStatus() { return status; }
    public String getBookerFirstName() { return bookerFirstName; }
    public String getBookerLastName() { return bookerLastName; }
    public String getBookerEmail() { return bookerEmail; }
    public String getBookerPhone() { return bookerPhone; }
    public boolean isBookerIsGuest() { return bookerIsGuest; }
    public String getGuestFirstName() { return guestFirstName; }
    public String getGuestLastName() { return guestLastName; }
    public String getGuestPhone() { return guestPhone; }
    public String getSpecialRequest() { return specialRequest; }
    public boolean isInvoiceRequested() { return invoiceRequested; }
    public String getInvoiceCompanyName() { return invoiceCompanyName; }
    public String getInvoiceTaxCode() { return invoiceTaxCode; }
    public String getInvoiceAddress() { return invoiceAddress; }
    public String getInvoiceEmail() { return invoiceEmail; }
    public boolean isTermsAccepted() { return termsAccepted; }
    public Instant getPaymentExpiresAt() { return paymentExpiresAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public Instant getCheckedInAt() { return checkedInAt; }
    public Instant getCheckedOutAt() { return checkedOutAt; }
    public boolean isCustomerHidden() { return customerHidden; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

}
