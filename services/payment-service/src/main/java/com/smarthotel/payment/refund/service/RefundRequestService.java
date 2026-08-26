package com.smarthotel.payment.refund.service;

import com.smarthotel.payment.integration.booking.BookingClient;
import com.smarthotel.payment.integration.hotel.HotelClient;
import com.smarthotel.payment.integration.notification.NotificationClient;
import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import com.smarthotel.payment.payment.service.PaymentService;
import com.smarthotel.payment.refund.dto.CreateRefundRequest;
import com.smarthotel.payment.refund.dto.RefundProofMedia;
import com.smarthotel.payment.refund.dto.RefundRequestResponse;
import com.smarthotel.payment.refund.entity.RefundRequest;
import com.smarthotel.payment.refund.entity.RefundRequestStatus;
import com.smarthotel.payment.refund.repository.RefundRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class RefundRequestService {
    private static final Set<RefundRequestStatus> ACTIVE_STATUSES = Set.of(
            RefundRequestStatus.PENDING_HOTEL_REVIEW,
            RefundRequestStatus.APPROVED,
            RefundRequestStatus.PARTIALLY_COMPLETED
    );

    private final RefundRequestRepository refundRequestRepository;
    private final PaymentRepository paymentRepository;
    private final BookingClient bookingClient;
    private final HotelClient hotelClient;
    private final NotificationClient notificationClient;
    private final PaymentService paymentService;

    public RefundRequestService(
            RefundRequestRepository refundRequestRepository,
            PaymentRepository paymentRepository,
            BookingClient bookingClient,
            HotelClient hotelClient,
            NotificationClient notificationClient,
            PaymentService paymentService
    ) {
        this.refundRequestRepository = refundRequestRepository;
        this.paymentRepository = paymentRepository;
        this.bookingClient = bookingClient;
        this.hotelClient = hotelClient;
        this.notificationClient = notificationClient;
        this.paymentService = paymentService;
    }

    @Transactional
    public RefundRequestResponse create(UUID customerId, CreateRefundRequest request) {
        BookingClient.BookingDetails booking = bookingClient.getBooking(request.bookingId());
        if (!booking.customerId().equals(customerId)) {
            throw new IllegalArgumentException("Booking không thuộc khách hàng hiện tại");
        }
        if ("REFUNDED".equalsIgnoreCase(booking.paymentStatus())) {
            throw new IllegalStateException("Booking này đã được hoàn tiền");
        }

        refundRequestRepository.findFirstByBookingIdAndStatusInOrderByRequestedAtDesc(
                booking.id(), ACTIVE_STATUSES
        ).ifPresent(existing -> {
            throw new IllegalStateException("Booking này đã có yêu cầu hoàn tiền đang được xử lý");
        });

        HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.hotelId());
        if (hotel.ownerId() == null) {
            throw new IllegalStateException("Khách sạn chưa có tài khoản quản lý để xử lý hoàn tiền");
        }

        ensureRefundRequestWindow(booking);

        List<Payment> paidPayments = paymentRepository.findAllByBookingIdOrderByCreatedAtDesc(booking.id())
                .stream()
                .filter(payment -> payment.getStatus() == PaymentStatus.PAID)
                .toList();
        if (paidPayments.isEmpty()) {
            throw new IllegalStateException("Booking chưa có khoản thanh toán thành công để yêu cầu hoàn tiền");
        }

        BigDecimal platformHeld = BigDecimal.ZERO;
        BigDecimal hotelDirect = BigDecimal.ZERO;
        BigDecimal manual = BigDecimal.ZERO;
        for (Payment payment : paidPayments) {
            if (payment.getMethod() == PaymentMethod.CASH) {
                hotelDirect = hotelDirect.add(payment.getAmount());
            } else if (payment.isWalletApplied() && !payment.isRevenueReleased()) {
                platformHeld = platformHeld.add(payment.getAmount());
            } else {
                manual = manual.add(payment.getAmount());
            }
        }
        BigDecimal totalPaid = platformHeld.add(hotelDirect).add(manual).setScale(0, RoundingMode.HALF_UP);

        if (hotelDirect.signum() > 0) {
            requireText(request.bankName(), "Vui lòng nhập ngân hàng nhận hoàn tiền");
            requireText(request.accountNumber(), "Vui lòng nhập số tài khoản nhận hoàn tiền");
            requireText(request.accountName(), "Vui lòng nhập tên chủ tài khoản nhận hoàn tiền");
        }

        HotelClient.RoomTypeDetails roomType = hotelClient.getRoomType(booking.roomTypeId());
        Policy policy = resolvePolicy(booking, roomType);

        RefundRequest item = refundRequestRepository.save(new RefundRequest(
                booking.id(), booking.bookingCode(), customerId, booking.hotelId(), hotel.ownerId(),
                booking.status(), booking.paymentOption(), normalizeReason(request.reasonCode()), request.note(),
                policy.code(), policy.message(), totalPaid, platformHeld, hotelDirect, manual,
                request.bankName(), request.accountNumber(), request.accountName()
        ));

        notificationClient.sendUser(
                hotel.ownerId(),
                "Khách yêu cầu hoàn tiền",
                "Booking " + booking.bookingCode() + " có yêu cầu hoàn " + totalPaid.stripTrailingZeros().toPlainString()
                        + " đ. Hãy kiểm tra chính sách và quyết định duyệt/từ chối.",
                "REFUND_REQUEST", "FINANCE", "/hotel-admin/wallet"
        );
        notificationClient.sendUser(
                customerId,
                "Đã gửi yêu cầu hoàn tiền",
                "Yêu cầu hoàn tiền booking " + booking.bookingCode()
                        + " đã được gửi tới khách sạn. Không đến nhận phòng không đồng nghĩa tự động được hoàn tiền.",
                "REFUND_STATUS", "FINANCE", "/customer/bookings#booking-" + booking.id()
        );
        return RefundRequestResponse.from(item);
    }

    @Transactional(readOnly = true)
    public List<RefundRequestResponse> customerRequests(UUID customerId) {
        return refundRequestRepository.findAllByCustomerIdOrderByRequestedAtDesc(customerId)
                .stream().map(RefundRequestResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<RefundRequestResponse> hotelRequests(UUID hotelAdminId) {
        return refundRequestRepository.findAllByHotelOwnerIdOrderByRequestedAtDesc(hotelAdminId)
                .stream().map(RefundRequestResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<RefundRequestResponse> adminRequests(RefundRequestStatus status) {
        List<RefundRequest> items = status == null
                ? refundRequestRepository.findAllByOrderByRequestedAtDesc()
                : refundRequestRepository.findAllByStatusOrderByRequestedAtDesc(status);
        return items.stream().map(RefundRequestResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public RefundRequestResponse byBooking(UUID customerId, UUID bookingId) {
        RefundRequest item = refundRequestRepository.findFirstByBookingIdOrderByRequestedAtDesc(bookingId)
                .orElseThrow(() -> new IllegalArgumentException("Booking chưa có yêu cầu hoàn tiền"));
        if (!item.getCustomerId().equals(customerId)) {
            throw new IllegalStateException("Bạn không có quyền xem yêu cầu hoàn tiền này");
        }
        return RefundRequestResponse.from(item);
    }

    @Transactional
    public RefundRequestResponse approve(UUID hotelAdminId, UUID requestId, String note) {
        RefundRequest item = find(requestId);
        ensureHotelOwner(item, hotelAdminId);
        item.approve(hotelAdminId, note);
        refundRequestRepository.save(item);

        notificationClient.sendUser(
                item.getCustomerId(),
                "Khách sạn đã duyệt yêu cầu hoàn tiền",
                approvedMessage(item),
                "REFUND_STATUS", "FINANCE", "/customer/bookings#booking-" + item.getBookingId()
        );
        if (item.getPlatformHeldAmount().signum() > 0 || item.getManualReconciliationAmount().signum() > 0) {
            notificationClient.sendRole(
                    "SYSTEM_ADMIN",
                    "Có yêu cầu hoàn tiền cần đối soát",
                    "Booking " + item.getBookingCode() + " đã được khách sạn duyệt. Phần EnziuRooms xử lý: "
                            + item.getPlatformHeldAmount().stripTrailingZeros().toPlainString() + " đ.",
                    "REFUND_REQUEST", "FINANCE", "/admin/wallet"
            );
        }
        return RefundRequestResponse.from(item);
    }

    @Transactional
    public RefundRequestResponse reject(UUID hotelAdminId, UUID requestId, String note) {
        RefundRequest item = find(requestId);
        ensureHotelOwner(item, hotelAdminId);
        item.reject(hotelAdminId, note);
        refundRequestRepository.save(item);
        notificationClient.sendUser(
                item.getCustomerId(),
                "Yêu cầu hoàn tiền bị từ chối",
                "Booking " + item.getBookingCode() + " không được duyệt hoàn tiền. Lý do: " + item.getReviewNote(),
                "REFUND_STATUS", "FINANCE", "/customer/bookings#booking-" + item.getBookingId()
        );
        return RefundRequestResponse.from(item);
    }

    @Transactional
    public RefundRequestResponse recordHotelRefund(
            UUID hotelAdminId,
            UUID requestId,
            String reference,
            MultipartFile proof
    ) {
        RefundRequest item = find(requestId);
        ensureHotelOwner(item, hotelAdminId);
        StoredImage image = readImage(proof, "chứng từ hoàn tiền");
        item.attachHotelRefundProof(image.data(), image.contentType(), image.fileName(), reference);
        refundRequestRepository.save(item);
        finalizeBookingIfComplete(item);
        notificationClient.sendUser(
                item.getCustomerId(),
                "Khách sạn đã xác nhận hoàn tiền",
                "Khách sạn đã ghi nhận hoàn trực tiếp " + item.getHotelDirectAmount().stripTrailingZeros().toPlainString()
                        + " đ cho booking " + item.getBookingCode() + ". Bạn có thể xem chứng từ trong yêu cầu hoàn tiền.",
                "REFUND_STATUS", "FINANCE", "/customer/bookings#booking-" + item.getBookingId()
        );
        return RefundRequestResponse.from(item);
    }

    @Transactional
    public RefundRequestResponse executePlatformRefund(UUID requestId) {
        RefundRequest item = find(requestId);
        ensureApproved(item);
        if (item.getPlatformHeldAmount().signum() <= 0) {
            throw new IllegalStateException("Yêu cầu này không có khoản EnziuRooms đang giữ để hoàn tự động");
        }
        if (item.getPlatformRefundedAt() != null) {
            return RefundRequestResponse.from(item);
        }

        List<Payment> candidates = paymentRepository.findAllByBookingIdOrderByCreatedAtDesc(item.getBookingId())
                .stream()
                .filter(payment -> payment.getStatus() == PaymentStatus.PAID)
                .filter(payment -> payment.getMethod() != PaymentMethod.CASH)
                .filter(Payment::isWalletApplied)
                .filter(payment -> !payment.isRevenueReleased())
                .toList();
        BigDecimal actual = candidates.stream()
                .map(Payment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(0, RoundingMode.HALF_UP);
        if (actual.compareTo(item.getPlatformHeldAmount()) != 0) {
            throw new IllegalStateException("Số tiền EnziuRooms đang giữ đã thay đổi. Hãy kiểm tra đối soát trước khi hoàn.");
        }
        for (Payment payment : candidates) {
            paymentService.refundComponentForApprovedRequest(payment.getId());
        }
        item.markPlatformRefunded();
        refundRequestRepository.save(item);
        finalizeBookingIfComplete(item);
        notificationClient.sendUser(
                item.getCustomerId(),
                "EnziuRooms đã hoàn phần thanh toán online",
                "Đã hoàn " + item.getPlatformHeldAmount().stripTrailingZeros().toPlainString()
                        + " đ vào Ví Enziu cho booking " + item.getBookingCode() + ".",
                "REFUND_STATUS", "FINANCE", "/customer/bookings#booking-" + item.getBookingId()
        );
        return RefundRequestResponse.from(item);
    }

    @Transactional
    public RefundRequestResponse markManualResolved(UUID adminId, UUID requestId, String note) {
        RefundRequest item = find(requestId);
        ensureApproved(item);
        item.markManualResolved(adminId, note);
        refundRequestRepository.save(item);
        finalizeBookingIfComplete(item);
        notificationClient.sendUser(
                item.getCustomerId(),
                "Đối soát hoàn tiền đã được cập nhật",
                "System Admin đã xử lý khoản cần đối soát thủ công cho booking " + item.getBookingCode() + ".",
                "REFUND_STATUS", "FINANCE", "/customer/bookings#booking-" + item.getBookingId()
        );
        return RefundRequestResponse.from(item);
    }

    @Transactional(readOnly = true)
    public RefundProofMedia hotelProof(UUID viewerId, boolean systemAdmin, UUID requestId) {
        RefundRequest item = find(requestId);
        if (!systemAdmin && !item.getCustomerId().equals(viewerId) && !item.getHotelOwnerId().equals(viewerId)) {
            throw new IllegalStateException("Bạn không có quyền xem chứng từ hoàn tiền này");
        }
        if (!item.hasHotelRefundProof()) {
            throw new IllegalStateException("Chưa có chứng từ hoàn tiền từ khách sạn");
        }
        return new RefundProofMedia(
                item.getHotelRefundProofData(), item.getHotelRefundProofContentType(), item.getHotelRefundProofFileName()
        );
    }

    private void ensureRefundRequestWindow(BookingClient.BookingDetails booking) {
        String status = booking.status() == null ? "" : booking.status().toUpperCase();
        if (Set.of("NO_SHOW", "CANCELLED").contains(status)) {
            return;
        }
        throw new IllegalStateException(
                "Chỉ booking đã hủy hoặc đã được Hotel Admin xác nhận NO_SHOW mới có thể gửi yêu cầu hoàn tiền"
        );
    }

    private Policy resolvePolicy(BookingClient.BookingDetails booking, HotelClient.RoomTypeDetails roomType) {
        String status = booking.status() == null ? "" : booking.status().toUpperCase();
        if ("NO_SHOW".equals(status) || "CONFIRMED".equals(status)) {
            return new Policy(
                    "NO_SHOW_REVIEW",
                    "Booking không đến nhận phòng không mặc định được hoàn tiền. Hotel Admin chỉ duyệt khi chính sách khách sạn cho phép hoặc chấp nhận ngoại lệ."
            );
        }
        if (roomType != null && !roomType.refundable()) {
            return new Policy(
                    "NON_REFUNDABLE_REVIEW",
                    "Loại phòng được cấu hình không hoàn tiền. Hotel Admin chỉ có thể duyệt nếu chấp nhận ngoại lệ."
            );
        }
        return new Policy(
                "HOTEL_REVIEW",
                "Yêu cầu hoàn tiền cần Hotel Admin xác nhận. Tiền EnziuRooms đang giữ và tiền khách sạn đã thu được xử lý tách biệt."
        );
    }

    private void finalizeBookingIfComplete(RefundRequest item) {
        item.refreshCompletionState();
        refundRequestRepository.save(item);
        if (item.getStatus() == RefundRequestStatus.COMPLETED) {
            bookingClient.markRefunded(item.getBookingId());
        }
    }

    private RefundRequest find(UUID id) {
        return refundRequestRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy yêu cầu hoàn tiền"));
    }

    private void ensureHotelOwner(RefundRequest item, UUID hotelAdminId) {
        if (hotelAdminId == null || !item.getHotelOwnerId().equals(hotelAdminId)) {
            throw new IllegalStateException("Yêu cầu hoàn tiền không thuộc khách sạn do tài khoản này quản lý");
        }
    }

    private void ensureApproved(RefundRequest item) {
        if (item.getStatus() != RefundRequestStatus.APPROVED
                && item.getStatus() != RefundRequestStatus.PARTIALLY_COMPLETED) {
            throw new IllegalStateException("Yêu cầu hoàn tiền chưa được Hotel Admin duyệt");
        }
    }

    private String approvedMessage(RefundRequest item) {
        StringBuilder text = new StringBuilder("Khách sạn đã duyệt yêu cầu hoàn booking ")
                .append(item.getBookingCode()).append(". ");
        if (item.getPlatformHeldAmount().signum() > 0) {
            text.append("EnziuRooms sẽ xử lý ")
                    .append(item.getPlatformHeldAmount().stripTrailingZeros().toPlainString()).append(" đ. ");
        }
        if (item.getHotelDirectAmount().signum() > 0) {
            text.append("Khách sạn phải hoàn trực tiếp ")
                    .append(item.getHotelDirectAmount().stripTrailingZeros().toPlainString()).append(" đ và tải chứng từ. ");
        }
        if (item.getManualReconciliationAmount().signum() > 0) {
            text.append("Có ").append(item.getManualReconciliationAmount().stripTrailingZeros().toPlainString())
                    .append(" đ cần System Admin đối soát thủ công.");
        }
        return text.toString().trim();
    }

    private StoredImage readImage(MultipartFile file, String label) {
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("Vui lòng tải " + label);
        if (file.getSize() > 5L * 1024L * 1024L) {
            throw new IllegalArgumentException("Ảnh " + label + " tối đa 5MB");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (!contentType.equals("image/png") && !contentType.equals("image/jpeg") && !contentType.equals("image/webp")) {
            throw new IllegalArgumentException("Ảnh " + label + " chỉ hỗ trợ PNG, JPG/JPEG hoặc WEBP");
        }
        try {
            return new StoredImage(file.getBytes(), contentType, safeFileName(file.getOriginalFilename()));
        } catch (IOException exception) {
            throw new IllegalStateException("Không thể đọc " + label, exception);
        }
    }

    private String safeFileName(String value) {
        if (value == null || value.isBlank()) return "refund-proof";
        String cleaned = value.replace('\\', '/');
        int index = cleaned.lastIndexOf('/');
        return (index >= 0 ? cleaned.substring(index + 1) : cleaned).replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private String normalizeReason(String value) {
        String reason = value == null ? "" : value.trim().toUpperCase();
        if (!Set.of("CANNOT_ARRIVE", "HOTEL_APPROVED", "PERSONAL_ISSUE", "OTHER").contains(reason)) {
            throw new IllegalArgumentException("Lý do yêu cầu hoàn tiền không hợp lệ");
        }
        return reason;
    }

    private void requireText(String value, String message) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(message);
    }

    private record Policy(String code, String message) {}
    private record StoredImage(byte[] data, String contentType, String fileName) {}
}
