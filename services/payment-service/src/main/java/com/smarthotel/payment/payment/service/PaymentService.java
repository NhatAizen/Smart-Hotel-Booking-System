package com.smarthotel.payment.payment.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.smarthotel.payment.common.exception.PaymentNotFoundException;
import com.smarthotel.payment.integration.booking.BookingClient;
import com.smarthotel.payment.integration.hotel.HotelClient;
import com.smarthotel.payment.payment.dto.CreatePayOsCheckoutRequest;
import com.smarthotel.payment.payment.dto.PaymentOrderResponse;
import com.smarthotel.payment.payment.dto.PaymentResponse;
import com.smarthotel.payment.payment.entity.*;
import com.smarthotel.payment.payment.repository.PaymentOrderRepository;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import com.smarthotel.payment.payos.PayOsApiClient;
import com.smarthotel.payment.payos.config.PayOsProperties;
import com.smarthotel.payment.wallet.dto.CreateWalletTopUpRequest;
import com.smarthotel.payment.wallet.service.HotelAdminDemotionFenceService;
import com.smarthotel.payment.wallet.service.WalletService;
import com.smarthotel.payment.wallet.service.RoleChangePaymentFinalityGuard;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class PaymentService {
    private final PaymentRepository paymentRepository;
    private final PaymentOrderRepository orderRepository;
    private final BookingClient bookingClient;
    private final HotelClient hotelClient;
    private final PayOsApiClient payOsClient;
    private final PayOsProperties payOsProperties;
    private final WalletService walletService;
    private final RoleChangePaymentFinalityGuard roleChangePaymentFinalityGuard;
    private final HotelAdminDemotionFenceService hotelAdminDemotionFenceService;

    public PaymentService(PaymentRepository paymentRepository,
                          PaymentOrderRepository orderRepository,
                          BookingClient bookingClient,
                          HotelClient hotelClient,
                          PayOsApiClient payOsClient,
                          PayOsProperties payOsProperties,
                          WalletService walletService,
                          RoleChangePaymentFinalityGuard roleChangePaymentFinalityGuard,
                          HotelAdminDemotionFenceService hotelAdminDemotionFenceService) {
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.bookingClient = bookingClient;
        this.hotelClient = hotelClient;
        this.payOsClient = payOsClient;
        this.payOsProperties = payOsProperties;
        this.walletService = walletService;
        this.roleChangePaymentFinalityGuard = roleChangePaymentFinalityGuard;
        this.hotelAdminDemotionFenceService = hotelAdminDemotionFenceService;
    }

    @Transactional
    public PaymentOrderResponse createPayOsCheckout(UUID customerId, CreatePayOsCheckoutRequest request) {
        List<UUID> bookingIds = request.bookingIds().stream().filter(Objects::nonNull).distinct().toList();
        if (bookingIds.isEmpty()) throw new IllegalArgumentException("Danh sách booking không được để trống");
        if (bookingIds.size() > 20) throw new IllegalArgumentException("Mỗi lần chỉ thanh toán tối đa 20 phòng");
        if (!payOsClient.isConfigured()) {
            throw new IllegalStateException("PayOS chưa được cấu hình trong payment-service");
        }

        List<BookingClient.BookingDetails> bookings = bookingIds.stream()
                .map(bookingClient::getBooking).toList();
        validateBookings(customerId, bookings);

        PaymentType paymentType = resolvePaymentType(bookings.get(0));
        UUID hotelId = bookings.get(0).hotelId();
        if (bookings.stream().anyMatch(b -> !hotelId.equals(b.hotelId()))) {
            throw new IllegalArgumentException("Một giao dịch chỉ được thanh toán cho một khách sạn");
        }
        if (bookings.stream().map(this::resolvePaymentType).anyMatch(type -> type != paymentType)) {
            throw new IllegalArgumentException("Các booking trong cùng giao dịch phải có cùng lựa chọn thanh toán");
        }

        BigDecimal totalAmount = bookings.stream()
                .map(BookingClient.BookingDetails::paymentDueAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        long payOsAmount = toVnd(totalAmount);
        if (payOsAmount < 2000) {
            throw new IllegalArgumentException("PayOS yêu cầu số tiền thanh toán tối thiểu 2.000 ₫");
        }

        HotelClient.HotelDetails hotel = hotelClient.getHotel(hotelId);
        if (hotel.ownerId() == null) throw new IllegalStateException("Khách sạn chưa có chủ sở hữu");
        hotelAdminDemotionFenceService.ensureOwnerMutationAllowed(hotel.ownerId());

        Instant expiresAt = bookings.stream()
                .map(BookingClient.BookingDetails::paymentExpiresAt)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElseGet(() -> Instant.now().plus(10, ChronoUnit.MINUTES));
        if (!Instant.now().isBefore(expiresAt)) {
            throw new IllegalStateException("Thời gian giữ phòng đã hết");
        }

        long orderCode = nextOrderCode();
        String description = "EZR" + String.format("%06d", Math.floorMod(orderCode, 1_000_000));
        PaymentOrder order = orderRepository.save(new PaymentOrder(
                orderCode, customerId, paymentType, totalAmount, description, expiresAt
        ));

        BigDecimal commissionRate = normalizedCommissionRate();
        List<Payment> payments = new ArrayList<>();
        for (BookingClient.BookingDetails booking : bookings) {
            payments.add(new Payment(
                    order.getId(), booking.id(), customerId, hotelId, hotel.ownerId(),
                    booking.paymentDueAmount(), PaymentMethod.PAYOS, paymentType, commissionRate
            ));
        }
        paymentRepository.saveAll(payments);

        BookingClient.BookingDetails buyer = bookings.get(0);
        PayOsApiClient.CreateLinkResult link = payOsClient.createPaymentLink(
                new PayOsApiClient.CreateLinkCommand(
                        orderCode, payOsAmount, description, expiresAt,
                        joinName(buyer.bookerLastName(), buyer.bookerFirstName()),
                        buyer.bookerEmail(), buyer.bookerPhone(),
                        buyer.invoiceRequested() ? buyer.invoiceCompanyName() : null,
                        buyer.invoiceRequested() ? buyer.invoiceTaxCode() : null,
                        buyer.invoiceRequested() ? buyer.invoiceAddress() : null
                )
        );
        if (link.orderCode() != orderCode || link.amount() != payOsAmount) {
            throw new IllegalStateException("PayOS trả về mã đơn hoặc số tiền không khớp");
        }
        order.attachPaymentLink(link.paymentLinkId(), link.checkoutUrl(), link.qrCode(), link.status());
        return response(order);
    }

    @Transactional
    public List<PaymentResponse> createWalletCheckout(UUID customerId, CreatePayOsCheckoutRequest request) {
        List<UUID> bookingIds = request.bookingIds().stream().filter(Objects::nonNull).distinct().toList();
        if (bookingIds.isEmpty()) throw new IllegalArgumentException("Danh sách booking không được để trống");
        if (bookingIds.size() > 20) throw new IllegalArgumentException("Mỗi lần chỉ thanh toán tối đa 20 phòng");

        List<BookingClient.BookingDetails> bookings = bookingIds.stream()
                .map(bookingClient::getBooking).toList();
        validateBookings(customerId, bookings);

        UUID hotelId = bookings.get(0).hotelId();
        if (bookings.stream().anyMatch(b -> !hotelId.equals(b.hotelId()))) {
            throw new IllegalArgumentException("Một giao dịch chỉ được thanh toán cho một khách sạn");
        }
        PaymentType paymentType = resolvePaymentType(bookings.get(0));
        if (bookings.stream().map(this::resolvePaymentType).anyMatch(type -> type != paymentType)) {
            throw new IllegalArgumentException("Các booking trong cùng giao dịch phải có cùng lựa chọn thanh toán");
        }

        BigDecimal totalAmount = bookings.stream()
                .map(BookingClient.BookingDetails::paymentDueAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        walletService.ensureCustomerBalance(customerId, totalAmount);

        HotelClient.HotelDetails hotel = hotelClient.getHotel(hotelId);
        if (hotel.ownerId() == null) throw new IllegalStateException("Khách sạn chưa có chủ sở hữu");
        hotelAdminDemotionFenceService.ensureOwnerMutationAllowed(hotel.ownerId());

        BigDecimal commissionRate = normalizedCommissionRate();
        List<PaymentResponse> result = new ArrayList<>();
        for (BookingClient.BookingDetails booking : bookings) {
            Payment payment = paymentRepository.save(new Payment(
                    null, booking.id(), customerId, hotelId, hotel.ownerId(),
                    booking.paymentDueAmount(), PaymentMethod.WALLET,
                    resolvePaymentType(booking), commissionRate
            ));
            payment.markPaid("WALLET-" + shortId(payment.getId()));
            walletService.applyCustomerWalletPayment(payment);
            walletService.applySuccessfulPayment(payment);
            bookingClient.applyPayment(payment.getBookingId(), payment.getAmount(), payment.getPaymentType());
            payment.markBookingApplied();
            result.add(PaymentResponse.from(payment));
        }
        return result;
    }

    @Transactional
    public PaymentResponse collectCashAtHotel(UUID hotelAdminId, UUID bookingId) {
        BookingClient.BookingDetails booking = bookingClient.getBooking(bookingId);
        HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.hotelId());
        if (hotel.ownerId() == null || !hotel.ownerId().equals(hotelAdminId)) {
            throw new IllegalArgumentException("Booking không thuộc khách sạn do tài khoản này quản lý");
        }
        if (!Set.of("CONFIRMED", "CHECKED_IN").contains(booking.status())) {
            throw new IllegalArgumentException(
                    "Chỉ booking đã xác nhận hoặc đang lưu trú mới được thu tiền tại quầy"
            );
        }
        if (booking.remainingAmount() == null || booking.remainingAmount().signum() <= 0
                || "PAID".equals(booking.paymentStatus())) {
            throw new IllegalArgumentException("Booking đã thanh toán đủ");
        }

        hotelAdminDemotionFenceService.ensureOwnerMutationAllowed(hotel.ownerId());

        BigDecimal amount = booking.remainingAmount().setScale(2, RoundingMode.HALF_UP);
        Payment payment = paymentRepository.save(new Payment(
                null, booking.id(), booking.customerId(), booking.hotelId(), hotel.ownerId(),
                amount, PaymentMethod.CASH, PaymentType.REMAINING_PAYMENT, normalizedCommissionRate()
        ));
        payment.markPaid("CASH-" + shortId(payment.getId()));

        // Hạch toán hoa hồng TRƯỚC khi cập nhật booking. Nếu ví đối tác không đủ để
        // khấu trừ hoa hồng thì toàn bộ transaction payment-service sẽ rollback.
        walletService.applyCashAtHotelPayment(payment);
        bookingClient.applyPayment(payment.getBookingId(), payment.getAmount(), payment.getPaymentType());
        payment.markBookingApplied();
        return PaymentResponse.from(payment);
    }

    @Transactional
    public PaymentOrderResponse createCheckInPayOsCheckout(
            UUID hotelAdminId,
            UUID bookingId
    ) {
        if (!payOsClient.isConfigured()) {
            throw new IllegalStateException("PayOS chưa được cấu hình trong payment-service");
        }

        BookingClient.BookingDetails booking = bookingClient.getBooking(bookingId);
        HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.hotelId());
        if (hotel.ownerId() == null || !hotel.ownerId().equals(hotelAdminId)) {
            throw new IllegalArgumentException(
                    "Booking không thuộc khách sạn do tài khoản này quản lý"
            );
        }
        hotelAdminDemotionFenceService.ensureOwnerMutationAllowed(hotel.ownerId());
        if (!Set.of("CONFIRMED", "CHECKED_IN").contains(booking.status())) {
            throw new IllegalArgumentException(
                    "Chỉ booking đã xác nhận hoặc đang lưu trú mới được thanh toán tại khách sạn"
            );
        }
        if (booking.remainingAmount() == null
                || booking.remainingAmount().signum() <= 0
                || "PAID".equals(booking.paymentStatus())) {
            throw new IllegalArgumentException("Booking đã thanh toán đủ");
        }

        PaymentType paymentType;
        if ("CHECKED_IN".equals(booking.status())
                || (booking.paidAmount() != null && booking.paidAmount().signum() > 0)) {
            // Khi khách đang lưu trú, số tiền phát sinh (ví dụ phí trả phòng trễ)
            // luôn là khoản còn lại, không phải thanh toán toàn bộ booking lần nữa.
            paymentType = PaymentType.REMAINING_PAYMENT;
        } else {
            paymentType = switch (booking.paymentOption()) {
                case "FULL_PAYMENT" -> PaymentType.FULL_PAYMENT;
                case "DEPOSIT", "PAY_AT_HOTEL" -> PaymentType.REMAINING_PAYMENT;
                default -> throw new IllegalArgumentException(
                        "Phương thức thanh toán booking không hợp lệ"
                );
            };
        }

        BigDecimal totalAmount = booking.remainingAmount()
                .setScale(2, RoundingMode.HALF_UP);

        // Nếu Hotel Admin bấm nhiều lần, không tạo thêm link PayOS cho cùng một
        // khoản còn lại. Trả lại order đang hoạt động để tránh khách trả trùng tiền.
        Optional<Payment> existingPendingPayment = paymentRepository
                .findFirstByBookingIdAndStatusInAndPaymentTypeOrderByCreatedAtDesc(
                        booking.id(),
                        List.of(PaymentStatus.PENDING),
                        paymentType
                );
        if (existingPendingPayment.isPresent()
                && existingPendingPayment.get().getPaymentOrderId() != null) {
            Optional<PaymentOrder> reusableOrder = orderRepository
                    .findById(existingPendingPayment.get().getPaymentOrderId())
                    .filter(PaymentOrder::isReusable)
                    .filter(order -> order.getAmount().compareTo(totalAmount) == 0);
            if (reusableOrder.isPresent()) {
                return response(reusableOrder.get());
            }
        }

        long payOsAmount = toVnd(totalAmount);
        if (payOsAmount < 2000) {
            throw new IllegalArgumentException(
                    "PayOS yêu cầu số tiền thanh toán tối thiểu 2.000 ₫"
            );
        }

        Instant expiresAt = Instant.now().plus(10, ChronoUnit.MINUTES);
        long orderCode = nextOrderCode();
        String description = "EZR"
                + String.format("%06d", Math.floorMod(orderCode, 1_000_000));
        PaymentOrder order = orderRepository.save(new PaymentOrder(
                orderCode,
                booking.customerId(),
                paymentType,
                totalAmount,
                description,
                expiresAt
        ));

        BigDecimal commissionRate = normalizedCommissionRate();
        paymentRepository.save(new Payment(
                order.getId(),
                booking.id(),
                booking.customerId(),
                booking.hotelId(),
                hotel.ownerId(),
                totalAmount,
                PaymentMethod.PAYOS,
                paymentType,
                commissionRate
        ));

        PayOsApiClient.CreateLinkResult link = payOsClient.createPaymentLink(
                new PayOsApiClient.CreateLinkCommand(
                        orderCode,
                        payOsAmount,
                        description,
                        expiresAt,
                        joinName(booking.bookerLastName(), booking.bookerFirstName()),
                        booking.bookerEmail(),
                        booking.bookerPhone(),
                        booking.invoiceRequested() ? booking.invoiceCompanyName() : null,
                        booking.invoiceRequested() ? booking.invoiceTaxCode() : null,
                        booking.invoiceRequested() ? booking.invoiceAddress() : null
                )
        );

        if (link.orderCode() != orderCode || link.amount() != payOsAmount) {
            throw new IllegalStateException(
                    "PayOS trả về mã đơn hoặc số tiền không khớp"
            );
        }

        order.attachPaymentLink(
                link.paymentLinkId(),
                link.checkoutUrl(),
                link.qrCode(),
                link.status()
        );
        return response(order);
    }

    @Transactional
    public PaymentOrderResponse createWalletTopUp(UUID ownerId, CreateWalletTopUpRequest request) {
        if (!payOsClient.isConfigured()) {
            throw new IllegalStateException("PayOS chưa được cấu hình trong payment-service");
        }
        BigDecimal amount = request.amount().setScale(2, RoundingMode.HALF_UP);
        long payOsAmount = toVnd(amount);
        if (payOsAmount < 2000 || payOsAmount > 100_000_000L) {
            throw new IllegalArgumentException("Số tiền nạp phải từ 2.000 ₫ đến 100.000.000 ₫");
        }

        long orderCode = nextOrderCode();
        String description = "NAP" + String.format("%06d", Math.floorMod(orderCode, 1_000_000));
        Instant expiresAt = Instant.now().plus(15, ChronoUnit.MINUTES);
        PaymentOrder order = orderRepository.save(new PaymentOrder(
                orderCode, ownerId, PaymentType.WALLET_TOP_UP, amount, description, expiresAt
        ));

        PayOsApiClient.CreateLinkResult link = payOsClient.createPaymentLink(
                new PayOsApiClient.CreateLinkCommand(
                        orderCode, payOsAmount, description, expiresAt,
                        null, null, null, null, null, null
                )
        );
        if (link.orderCode() != orderCode || link.amount() != payOsAmount) {
            throw new IllegalStateException("PayOS trả về mã đơn hoặc số tiền không khớp");
        }
        order.attachPaymentLink(link.paymentLinkId(), link.checkoutUrl(), link.qrCode(), link.status());
        return response(order);
    }

    @Transactional
    public void handlePayOsWebhook(JsonNode payload) {
        PayOsApiClient.WebhookData data = payOsClient.verifyWebhook(payload);
        Optional<PaymentOrder> existing = orderRepository.findByOrderCodeForUpdate(data.orderCode());
        // PayOS gửi giao dịch mẫu khi xác nhận webhook. Không có order tương ứng vẫn phải trả 2xx.
        if (existing.isEmpty()) return;
        PaymentOrder order = existing.get();
        if (data.success() && "00".equals(data.transactionCode())) {
            processPaid(order, data.amount(), data.reference(), data.paymentLinkId(), "PAID");
        }
    }

    @Transactional
    public PaymentOrderResponse sync(UUID actorId, long orderCode) {
        PaymentOrder order = findOrderForActor(orderCode, actorId, true);
        if (order.getStatus() == PaymentOrderStatus.PAID) return response(order);

        PayOsApiClient.PaymentLinkInfo info = payOsClient.getPaymentLink(orderCode);
        String status = safeUpper(info.status());
        if ("PAID".equals(status)) {
            processPaid(order, info.amountPaid(), info.reference(), info.paymentLinkId(), status);
        } else if ("CANCELLED".equals(status)) {
            markCancelled(order, "Khách hàng đã hủy thanh toán", status);
        } else if ("EXPIRED".equals(status)) {
            markExpired(order);
        } else {
            order.markProcessing();
        }
        return response(order);
    }

    @Transactional
    public PaymentOrderResponse cancel(UUID actorId, long orderCode) {
        PaymentOrder order = findOrderForActor(orderCode, actorId, true);
        if (order.getStatus() == PaymentOrderStatus.PAID) {
            throw new IllegalStateException("Không thể hủy giao dịch đã thanh toán");
        }
        PayOsApiClient.PaymentLinkInfo info = payOsClient.cancelPaymentLink(
                orderCode, "Khách hàng hủy thanh toán"
        );
        markCancelled(order, "Khách hàng hủy thanh toán", info.status());
        return response(order);
    }

    @Transactional(readOnly = true)
    public PaymentOrderResponse getOrder(UUID actorId, long orderCode) {
        return response(findOrderForActor(orderCode, actorId, false));
    }

    @Transactional(readOnly = true)
    public List<PaymentOrderResponse> getCustomerOrders(UUID customerId) {
        return orderRepository.findAllByCustomerIdOrderByCreatedAtDesc(customerId)
                .stream().map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public PaymentResponse getById(UUID paymentId) {
        return PaymentResponse.from(findPayment(paymentId));
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> getByBooking(UUID bookingId) {
        return paymentRepository.findAllByBookingIdOrderByCreatedAtDesc(bookingId)
                .stream().map(PaymentResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> getByCustomer(UUID customerId) {
        return paymentRepository.findAllByCustomerIdOrderByCreatedAtDesc(customerId)
                .stream().map(PaymentResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> getByStatus(PaymentStatus status) {
        return paymentRepository.findAllByStatusOrderByCreatedAtDesc(status)
                .stream().map(PaymentResponse::from).toList();
    }

    @Transactional
    public PaymentResponse refund(UUID paymentId) {
        PaymentResponse response = refundComponentForApprovedRequest(paymentId);
        bookingClient.markRefunded(response.bookingId());
        return response;
    }

    /**
     * Hoàn đúng một payment component đã được duyệt trong refund request.
     *
     * Khác refund(paymentId) ở chỗ KHÔNG tự đánh dấu toàn booking REFUNDED.
     * RefundRequestService sẽ chỉ finalize booking sau khi cả phần EnziuRooms,
     * phần khách sạn thu trực tiếp và phần đối soát thủ công (nếu có) đều xong.
     */
    @Transactional
    public PaymentResponse refundComponentForApprovedRequest(UUID paymentId) {
        Payment payment = findPayment(paymentId);
        if (payment.getStatus() == PaymentStatus.REFUNDED) {
            return PaymentResponse.from(payment);
        }
        if (payment.getStatus() != PaymentStatus.PAID) {
            throw new IllegalStateException("Chỉ giao dịch PAID mới có thể hoàn tiền");
        }
        if (!payment.isWalletApplied()) {
            throw new IllegalStateException("Giao dịch chưa được hạch toán ví nên chưa thể hoàn tiền an toàn");
        }
        if (payment.getMethod() == PaymentMethod.CASH) {
            throw new IllegalStateException(
                    "Giao dịch tiền mặt tại quầy không nằm trong tiền EnziuRooms đang giữ. "
                            + "Khách sạn phải hoàn trực tiếp và tải chứng từ."
            );
        }
        if (payment.isRevenueReleased()) {
            throw new IllegalStateException(
                    "Doanh thu của giao dịch này đã được giải ngân. Cần đối soát thủ công trước khi hoàn."
            );
        }
        walletService.reverseSuccessfulPayment(payment);
        walletService.creditCustomerRefund(payment);
        payment.refund();
        return PaymentResponse.from(payment);
    }

    private void processPaid(PaymentOrder order, long receivedAmount, String reference,
                             String paymentLinkId, String providerStatus) {
        if (order.getStatus() == PaymentOrderStatus.PAID) return;
        roleChangePaymentFinalityGuard.ensureCanProcessPaidWebhook(order.getStatus());
        long expected = toVnd(order.getAmount());
        if (receivedAmount != expected) {
            throw new IllegalArgumentException(
                    "Số tiền webhook PayOS không khớp. Cần " + expected + ", nhận " + receivedAmount
            );
        }
        if (order.getPaymentLinkId() != null && paymentLinkId != null
                && !order.getPaymentLinkId().equals(paymentLinkId)) {
            throw new IllegalArgumentException("Mã link thanh toán PayOS không khớp");
        }

        List<Payment> payments = order.getPaymentType() == PaymentType.WALLET_TOP_UP
                ? List.of()
                : paymentRepository.findAllByPaymentOrderIdOrderByCreatedAtAsc(order.getId());
        payments.stream()
                .map(Payment::getHotelOwnerId)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .forEach(hotelAdminDemotionFenceService::ensureOwnerMutationAllowed);

        String providerReference = reference == null || reference.isBlank()
                ? "PAYOS-" + order.getOrderCode() : reference;
        order.markPaid(providerReference, providerStatus);

        if (order.getPaymentType() == PaymentType.WALLET_TOP_UP) {
            if (!order.isWalletApplied()) {
                walletService.applyWalletTopUp(order.getId(), order.getCustomerId(), order.getAmount());
                order.markWalletApplied();
            }
            return;
        }

        for (Payment payment : payments) {
            String allocationReference = providerReference + "-" + shortId(payment.getId());
            payment.markPaid(allocationReference);
            if (!payment.isBookingApplied()) {
                bookingClient.applyPayment(payment.getBookingId(), payment.getAmount(), payment.getPaymentType());
                payment.markBookingApplied();
            }
            if (!payment.isWalletApplied()) {
                walletService.applySuccessfulPayment(payment);
            }
        }
    }

    private void markCancelled(PaymentOrder order, String reason, String providerStatus) {
        if (order.getStatus() == PaymentOrderStatus.PAID) return;
        order.markCancelled(reason, providerStatus);
        for (Payment payment : paymentRepository.findAllByPaymentOrderIdOrderByCreatedAtAsc(order.getId())) {
            payment.markCancelled(reason);
            bookingClient.markPaymentFailed(payment.getBookingId());
        }
    }

    private void markExpired(PaymentOrder order) {
        if (order.getStatus() == PaymentOrderStatus.PAID) return;
        order.markExpired();
        for (Payment payment : paymentRepository.findAllByPaymentOrderIdOrderByCreatedAtAsc(order.getId())) {
            payment.markExpired();
            bookingClient.markPaymentFailed(payment.getBookingId());
        }
    }

    private void validateBookings(UUID customerId, List<BookingClient.BookingDetails> bookings) {
        for (BookingClient.BookingDetails booking : bookings) {
            if (!customerId.equals(booking.customerId())) {
                throw new IllegalArgumentException("Booking không thuộc khách hàng hiện tại");
            }
            if ("PAY_AT_HOTEL".equals(booking.paymentOption())) {
                throw new IllegalArgumentException("Booking thanh toán tại khách sạn không cần PayOS");
            }
            if (Set.of("CANCELLED", "CHECKED_OUT").contains(booking.status())) {
                throw new IllegalArgumentException("Booking không thể thanh toán ở trạng thái " + booking.status());
            }
            if (booking.paymentDueAmount() == null || booking.paymentDueAmount().signum() <= 0) {
                throw new IllegalArgumentException("Booking " + booking.id() + " không còn số tiền cần thanh toán");
            }
            if (booking.paymentExpiresAt() != null
                    && !Instant.now().isBefore(booking.paymentExpiresAt())
                    && "PENDING_PAYMENT".equals(booking.status())) {
                throw new IllegalStateException("Booking " + booking.bookingCode() + " đã hết thời gian giữ phòng");
            }
        }
    }

    private PaymentType resolvePaymentType(BookingClient.BookingDetails booking) {
        return switch (booking.paymentOption()) {
            case "DEPOSIT" -> "PARTIALLY_PAID".equals(booking.paymentStatus())
                    ? PaymentType.REMAINING_PAYMENT : PaymentType.DEPOSIT;
            case "FULL_PAYMENT" -> PaymentType.FULL_PAYMENT;
            default -> throw new IllegalArgumentException("Phương thức thanh toán booking không hợp lệ");
        };
    }

    /**
     * Customer được phép đọc/sync order của chính mình.
     * Hotel Admin cũng được phép đọc/sync order thu phần còn lại tại quầy nếu
     * chính tài khoản đó là chủ khách sạn của payment thuộc order.
     *
     * Điều này quan trọng với môi trường local: PayOS return URL có thể quay về
     * tab đang đăng nhập HOTEL_ADMIN, trong khi PaymentOrder.customerId vẫn phải
     * là customer của booking. Không mở quyền cho Hotel Admin khác.
     */
    private PaymentOrder findOrderForActor(long orderCode, UUID actorId, boolean lock) {
        PaymentOrder order = (lock
                ? orderRepository.findByOrderCodeForUpdate(orderCode)
                : orderRepository.findByOrderCode(orderCode))
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy đơn thanh toán PayOS"));

        if (actorId.equals(order.getCustomerId())) {
            return order;
        }

        boolean hotelOwner = paymentRepository
                .findAllByPaymentOrderIdOrderByCreatedAtAsc(order.getId())
                .stream()
                .map(Payment::getHotelOwnerId)
                .filter(Objects::nonNull)
                .anyMatch(actorId::equals);

        if (!hotelOwner) {
            throw new IllegalArgumentException(
                    "Đơn thanh toán không thuộc tài khoản hiện tại"
            );
        }

        return order;
    }

    private PaymentOrderResponse response(PaymentOrder order) {
        List<PaymentResponse> payments = paymentRepository
                .findAllByPaymentOrderIdOrderByCreatedAtAsc(order.getId())
                .stream().map(PaymentResponse::from).toList();
        return PaymentOrderResponse.from(order, payments);
    }

    private Payment findPayment(UUID id) {
        return paymentRepository.findById(id).orElseThrow(() -> new PaymentNotFoundException(id));
    }

    private long nextOrderCode() {
        long value = System.currentTimeMillis();
        while (orderRepository.existsByOrderCode(value)) value++;
        return value;
    }

    private BigDecimal normalizedCommissionRate() {
        BigDecimal rate = payOsProperties.getCommissionRate() == null
                ? BigDecimal.TEN : payOsProperties.getCommissionRate();
        if (rate.signum() < 0 || rate.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new IllegalStateException("PAYOS_COMMISSION_RATE phải nằm trong khoảng 0-100");
        }
        return rate.setScale(2, RoundingMode.HALF_UP);
    }

    private static long toVnd(BigDecimal amount) {
        return amount.setScale(0, RoundingMode.HALF_UP).longValueExact();
    }
    private static String joinName(String lastName, String firstName) {
        return ((lastName == null ? "" : lastName.trim()) + " "
                + (firstName == null ? "" : firstName.trim())).trim();
    }
    private static String shortId(UUID id) { return id.toString().replace("-", "").substring(0, 8); }
    private static String safeUpper(String value) { return value == null ? "" : value.trim().toUpperCase(); }
}
