package com.smarthotel.booking.complaint.service;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.common.exception.BookingNotFoundException;
import com.smarthotel.booking.complaint.dto.AdminComplaintUpdateRequest;
import com.smarthotel.booking.complaint.dto.ComplaintBookingContextResponse;
import com.smarthotel.booking.complaint.dto.ComplaintEvidenceResponse;
import com.smarthotel.booking.complaint.dto.ComplaintResponse;
import com.smarthotel.booking.complaint.dto.ComplaintTimelineResponse;
import com.smarthotel.booking.complaint.dto.CreateComplaintRequest;
import com.smarthotel.booking.complaint.dto.HotelComplaintActionRequest;
import com.smarthotel.booking.complaint.entity.Complaint;
import com.smarthotel.booking.complaint.entity.ComplaintActorRole;
import com.smarthotel.booking.complaint.entity.ComplaintEventType;
import com.smarthotel.booking.complaint.entity.ComplaintEvidence;
import com.smarthotel.booking.complaint.entity.ComplaintResolutionType;
import com.smarthotel.booking.complaint.entity.ComplaintStatus;
import com.smarthotel.booking.complaint.entity.ComplaintTimelineEntry;
import com.smarthotel.booking.complaint.media.ComplaintEvidenceStorageService;
import com.smarthotel.booking.complaint.repository.ComplaintEvidenceRepository;
import com.smarthotel.booking.complaint.repository.ComplaintRepository;
import com.smarthotel.booking.complaint.repository.ComplaintTimelineRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.integration.payment.PaymentClient;
import org.springframework.core.io.Resource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.math.BigDecimal;

@Service
public class ComplaintService {
    private static final long MAX_EVIDENCE_PER_CASE = 24;
    private final ComplaintRepository complaintRepository;
    private final ComplaintEvidenceRepository evidenceRepository;
    private final ComplaintTimelineRepository timelineRepository;
    private final BookingRepository bookingRepository;
    private final ComplaintEvidenceStorageService storageService;
    private final HotelClient hotelClient;
    private final NotificationClient notificationClient;
    private final PaymentClient paymentClient;

    public ComplaintService(ComplaintRepository complaintRepository,
                            ComplaintEvidenceRepository evidenceRepository,
                            ComplaintTimelineRepository timelineRepository,
                            BookingRepository bookingRepository,
                            ComplaintEvidenceStorageService storageService,
                            HotelClient hotelClient,
                            NotificationClient notificationClient,
                            PaymentClient paymentClient) {
        this.complaintRepository = complaintRepository;
        this.evidenceRepository = evidenceRepository;
        this.timelineRepository = timelineRepository;
        this.bookingRepository = bookingRepository;
        this.storageService = storageService;
        this.hotelClient = hotelClient;
        this.notificationClient = notificationClient;
        this.paymentClient = paymentClient;
    }

    @Transactional
    public ComplaintResponse create(UUID customerId, CreateComplaintRequest request, List<MultipartFile> files) {
        Booking booking = bookingRepository.findById(request.bookingId())
                .orElseThrow(() -> new BookingNotFoundException(request.bookingId()));
        requireCustomer(booking, customerId);
        HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.getHotelId());
        if (hotel.ownerId() == null) throw new IllegalStateException("Khách sạn chưa có người quản lý hợp lệ");
        HotelClient.RoomDetails room = hotelClient.getRoom(booking.getRoomId());
        HotelClient.RoomTypeDetails roomType = booking.getRoomTypeId() == null
                ? null : hotelClient.getRoomType(booking.getRoomTypeId());

        Complaint complaint = complaintRepository.save(new Complaint(
                booking.getId(), booking.getBookingCode(), booking.getCustomerId(), customerName(booking),
                booking.getHotelId(), hotel.ownerId(), hotel.name(), booking.getRoomTypeId(),
                roomType == null ? null : roomType.name(), booking.getRoomId(), room.roomNumber(),
                request.issueType(), request.title(), request.description(), request.disputedAmount()
        ));
        timelineRepository.save(new ComplaintTimelineEntry(
                complaint.getId(), ComplaintEventType.SUBMITTED, customerId, ComplaintActorRole.CUSTOMER,
                "Khách hàng đã gửi khiếu nại.", null, ComplaintStatus.SUBMITTED, true
        ));
        saveEvidence(complaint, customerId, ComplaintActorRole.CUSTOMER, files);
        notificationClient.sendUser(customerId, "Đã tiếp nhận khiếu nại " + complaint.getComplaintCode(),
                "Khiếu nại đã được gửi đến khách sạn để xem xét và xử lý trước.",
                "COMPLAINT_SUBMITTED", "COMPLAINT", "/customer/complaints");
        notificationClient.sendUser(hotel.ownerId(), "Khách sạn có khiếu nại mới",
                "Khiếu nại " + complaint.getComplaintCode() + " liên quan đến " + hotel.name() + ".",
                "COMPLAINT_SUBMITTED", "COMPLAINT", "/hotel-admin/complaints");
        return response(complaint, false);
    }

    @Transactional(readOnly = true)
    public List<ComplaintResponse> customerList(UUID customerId) {
        return complaintRepository.findAllByCustomerIdOrderByCreatedAtDesc(customerId).stream()
                .map(item -> response(item, false)).toList();
    }

    @Transactional(readOnly = true)
    public ComplaintResponse customerGet(UUID customerId, UUID complaintId) {
        Complaint complaint = requireComplaint(complaintId);
        if (!complaint.getCustomerId().equals(customerId)) deny();
        return response(complaint, false);
    }

    @Transactional
    public ComplaintResponse customerAddEvidence(UUID customerId, UUID complaintId, String note,
                                                  List<MultipartFile> files) {
        Complaint complaint = requireComplaint(complaintId);
        if (!complaint.getCustomerId().equals(customerId)) deny();
        ensureOpen(complaint);
        requireFiles(files);
        ComplaintStatus before = complaint.getStatus();
        complaint.resumeAfterCustomerEvidence();
        saveEvidence(complaint, customerId, ComplaintActorRole.CUSTOMER, files);
        timelineRepository.save(new ComplaintTimelineEntry(complaintId, ComplaintEventType.CUSTOMER_EVIDENCE_ADDED,
                customerId, ComplaintActorRole.CUSTOMER, normalizeMessage(note, "Khách hàng đã bổ sung chứng cứ."),
                before, complaint.getStatus(), true));
        notifyCaseStakeholders(complaint, "Khách hàng đã bổ sung chứng cứ",
                "Có chứng cứ mới trong khiếu nại " + complaint.getComplaintCode() + ".");
        return response(complaint, false);
    }

    @Transactional
    public ComplaintResponse customerCancel(UUID customerId, UUID complaintId) {
        Complaint complaint = requireComplaint(complaintId);
        if (!complaint.getCustomerId().equals(customerId)) deny();
        ComplaintStatus before = complaint.getStatus();
        complaint.cancelByCustomer();
        timelineRepository.save(new ComplaintTimelineEntry(complaintId, ComplaintEventType.CANCELLED,
                customerId, ComplaintActorRole.CUSTOMER, "Khách hàng đã hủy khiếu nại.", before,
                ComplaintStatus.CANCELLED, true));
        notifyCaseStakeholders(complaint, "Khiếu nại đã được khách hàng hủy",
                complaint.getComplaintCode() + " đã chuyển sang trạng thái Đã hủy.");
        return response(complaint, false);
    }

    @Transactional(readOnly = true)
    public List<ComplaintResponse> hotelList(UUID hotelAdminId, String token) {
        Set<UUID> owned = ownedHotelIds(hotelAdminId, token);
        if (owned.isEmpty()) return List.of();
        return complaintRepository.findAllByHotelIdInOrderByCreatedAtDesc(owned).stream()
                .map(item -> response(item, false)).toList();
    }

    @Transactional(readOnly = true)
    public ComplaintResponse hotelGet(UUID hotelAdminId, String token, UUID complaintId) {
        Complaint complaint = requireOwnedHotelComplaint(hotelAdminId, token, complaintId);
        return response(complaint, false);
    }

    @Transactional
    public ComplaintResponse hotelRespond(UUID hotelAdminId, String token, UUID complaintId,
                                           String message, List<MultipartFile> files) {
        Complaint complaint = requireOwnedHotelComplaint(hotelAdminId, token, complaintId);
        ensureOpen(complaint);
        ComplaintStatus before = complaint.getStatus();
        saveEvidence(complaint, hotelAdminId, ComplaintActorRole.HOTEL_ADMIN, files);
        timelineRepository.save(new ComplaintTimelineEntry(complaintId, ComplaintEventType.HOTEL_RESPONSE_ADDED,
                hotelAdminId, ComplaintActorRole.HOTEL_ADMIN, requiredMessage(message), before,
                complaint.getStatus(), true));
        notificationClient.sendUser(complaint.getCustomerId(), "Khách sạn đã phản hồi khiếu nại",
                complaint.getHotelNameSnapshot() + " đã phản hồi case " + complaint.getComplaintCode() + ".",
                "COMPLAINT_RESPONSE", "COMPLAINT", "/customer/complaints");
        if (complaint.getEscalatedAt() != null) notificationClient.sendRole("SYSTEM_ADMIN", "Khách sạn đã phản hồi",
                "Có phản hồi mới trong " + complaint.getComplaintCode() + ".", "COMPLAINT_RESPONSE",
                "COMPLAINT", "/admin/complaints");
        return response(complaint, false);
    }

    @Transactional
    public ComplaintResponse hotelAct(UUID hotelAdminId, String token, UUID complaintId,
                                      HotelComplaintActionRequest request, List<MultipartFile> files) {
        Complaint complaint = requireOwnedHotelComplaint(hotelAdminId, token, complaintId);
        ensureOpen(complaint);
        String message = requiredMessage(request.message());
        ComplaintStatus before = complaint.getStatus();
        ComplaintEventType event;
        switch (request.action()) {
            case START_REVIEW -> {
                complaint.hotelReview(false);
                event = ComplaintEventType.STATUS_CHANGED;
            }
            case REQUEST_CUSTOMER_EVIDENCE -> {
                complaint.hotelReview(true);
                event = ComplaintEventType.STATUS_CHANGED;
            }
            case RESOLVE -> {
                complaint.hotelResolve(hotelAdminId, message);
                event = ComplaintEventType.HOTEL_RESOLVED;
            }
            case ESCALATE -> {
                complaint.escalate();
                event = ComplaintEventType.ESCALATED_TO_SYSTEM;
            }
            case COMPLETE_REQUIRED_ACTION -> {
                if (complaint.getStatus() != ComplaintStatus.HOTEL_ACTION_REQUIRED) {
                    throw new IllegalStateException("Chưa có yêu cầu xử lý của quản trị hệ thống");
                }
                requireFiles(files);
                if (complaint.getRequiredRefundAmount() != null) {
                    if (request.refundedAmount() == null || request.refundedAmount().compareTo(complaint.getRequiredRefundAmount()) < 0) {
                        throw new IllegalArgumentException("Số tiền báo hoàn chưa đủ theo quyết định của quản trị hệ thống");
                    }
                    if (request.refundRequestId() != null) paymentClient.requireCompletedRefund(token, true, request.refundRequestId(),
                            complaint.getBookingId(), complaint.getRequiredRefundAmount());
                }
                complaint.hotelCompleteAction(complaint.getRequiredRefundAmount() == null ? null : request.refundRequestId(),
                        complaint.getRequiredRefundAmount() == null ? null : request.refundedAmount());
                event = ComplaintEventType.HOTEL_ACTION_COMPLETED;
            }
            default -> throw new IllegalArgumentException("Thao tác xử lý không hợp lệ");
        }
        saveEvidence(complaint, hotelAdminId, ComplaintActorRole.HOTEL_ADMIN, files);
        timelineRepository.save(new ComplaintTimelineEntry(complaintId, event, hotelAdminId,
                ComplaintActorRole.HOTEL_ADMIN, message, before, complaint.getStatus(), true));
        notificationClient.sendUser(complaint.getCustomerId(),
                event == ComplaintEventType.ESCALATED_TO_SYSTEM ? "Khiếu nại chuyển quản trị hệ thống phân xử" : "Khách sạn cập nhật khiếu nại",
                complaint.getComplaintCode() + ": " + message, "COMPLAINT_STATUS", "COMPLAINT", "/customer/complaints");
        if (complaint.getEscalatedAt() != null) notificationClient.sendRole("SYSTEM_ADMIN",
                event == ComplaintEventType.ESCALATED_TO_SYSTEM ? "Khiếu nại cần phân xử" : "Khách sạn đã thực hiện yêu cầu",
                complaint.getComplaintCode() + ": " + message, "COMPLAINT_STATUS", "COMPLAINT", "/admin/complaints");
        return response(complaint, false);
    }

    @Transactional(readOnly = true)
    public List<ComplaintResponse> adminList(ComplaintStatus status) {
        List<Complaint> items = status == null ? complaintRepository.findAllByEscalatedAtIsNotNullOrderByCreatedAtDesc()
                : complaintRepository.findAllByEscalatedAtIsNotNullAndStatusOrderByCreatedAtDesc(status);
        return items.stream().map(item -> response(item, true)).toList();
    }

    @Transactional(readOnly = true)
    public ComplaintResponse adminGet(UUID complaintId) { return response(requireComplaint(complaintId), true); }

    @Transactional
    public ComplaintResponse adminUpdate(UUID adminId, String token, UUID complaintId,
                                         AdminComplaintUpdateRequest request) {
        Complaint complaint = requireComplaint(complaintId);
        ensureOpen(complaint);
        ComplaintStatus before = complaint.getStatus();
        String note = requiredMessage(request.note());
        ComplaintEventType event = ComplaintEventType.STATUS_CHANGED;
        switch (request.status()) {
            case SYSTEM_REVIEW -> complaint.systemReview(false);
            case WAITING_FOR_CUSTOMER -> complaint.systemReview(true);
            case HOTEL_ACTION_REQUIRED -> {
                BigDecimal amount = request.requiredRefundAmount();
                boolean refund = request.resolutionType() == ComplaintResolutionType.FULL_REFUND_ACCEPTED
                        || request.resolutionType() == ComplaintResolutionType.PARTIAL_REFUND_ACCEPTED;
                if (refund) {
                    Booking booking = bookingRepository.findById(complaint.getBookingId())
                            .orElseThrow(() -> new BookingNotFoundException(complaint.getBookingId()));
                    BigDecimal paid = booking.getPaidAmount() == null ? BigDecimal.ZERO : booking.getPaidAmount();
                    if (amount == null || amount.signum() <= 0 || amount.compareTo(paid) > 0
                            || (request.resolutionType() == ComplaintResolutionType.FULL_REFUND_ACCEPTED && amount.compareTo(paid) != 0)) {
                        throw new IllegalArgumentException("Số tiền hoàn phải phù hợp với số tiền khách đã thanh toán");
                    }
                }
                if (request.refundRequestId() != null) {
                    paymentClient.requireRefundForBooking(token, request.refundRequestId(), complaint.getBookingId());
                }
                complaint.requireHotelAction(request.resolutionType(), note, amount, request.severity(),
                        request.violationReviewRecommended());
                event = ComplaintEventType.HOTEL_ACTION_REQUIRED;
            }
            case REJECTED -> complaint.reject(adminId, request.resolutionType(), note);
            case RESOLVED -> {
                if (complaint.getStatus() != ComplaintStatus.AWAITING_SYSTEM_CONFIRMATION) {
                    throw new IllegalStateException("Khách sạn chưa gửi kết quả thực hiện để xác nhận");
                }
                if (complaint.getRequiredRefundAmount() != null) {
                    if (complaint.getRefundRequestId() != null) {
                        paymentClient.requireCompletedRefund(token, false, complaint.getRefundRequestId(),
                                complaint.getBookingId(), complaint.getRequiredRefundAmount());
                    } else if (!request.refundVerified()) {
                        throw new IllegalArgumentException("Cần xác minh chứng từ hoàn tiền của khách sạn trước khi kết thúc");
                    }
                }
                complaint.systemConfirm(adminId, note);
                event = ComplaintEventType.SYSTEM_CONFIRMED;
            }
            default -> throw new IllegalArgumentException("Thao tác không đúng bước phân xử khiếu nại");
        }
        // Decisions and instructions must be visible to both parties.
        timelineRepository.save(new ComplaintTimelineEntry(complaintId, event, adminId,
                ComplaintActorRole.SYSTEM_ADMIN, note, before, complaint.getStatus(), true));
        String content = "Khiếu nại " + complaint.getComplaintCode() + " đã được cập nhật trạng thái.";
        notificationClient.sendUser(complaint.getCustomerId(), "Cập nhật khiếu nại", content,
                complaint.getStatus().isTerminal() ? "COMPLAINT_RESOLVED" : "COMPLAINT_STATUS",
                "COMPLAINT", "/customer/complaints");
        notificationClient.sendUser(complaint.getHotelOwnerId(), "Cập nhật khiếu nại", content,
                complaint.getStatus().isTerminal() ? "COMPLAINT_RESOLVED" : "COMPLAINT_STATUS",
                "COMPLAINT", "/hotel-admin/complaints");
        return response(complaint, true);
    }

    @Transactional(readOnly = true)
    public EvidenceDownload evidence(UUID viewerId, String role, String token, UUID complaintId, UUID evidenceId) {
        Complaint complaint = requireComplaint(complaintId);
        String normalizedRole = role == null ? "" : role.toUpperCase(Locale.ROOT).replace("ROLE_", "");
        switch (normalizedRole) {
            case "CUSTOMER" -> { if (!complaint.getCustomerId().equals(viewerId)) deny(); }
            case "HOTEL_ADMIN" -> requireOwnedHotelComplaint(viewerId, token, complaintId);
            case "SYSTEM_ADMIN" -> { }
            default -> deny();
        }
        ComplaintEvidence item = evidenceRepository.findByIdAndComplaintId(evidenceId, complaintId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy chứng cứ"));
        return new EvidenceDownload(storageService.load(item.getStoredFileName()), item.getContentType(), item.getOriginalFileName());
    }

    private void saveEvidence(Complaint complaint, UUID actorId, ComplaintActorRole role, List<MultipartFile> files) {
        if (files == null || files.stream().noneMatch(file -> file != null && !file.isEmpty())) return;
        long newCount = files.stream().filter(file -> file != null && !file.isEmpty()).count();
        if (evidenceRepository.countByComplaintId(complaint.getId()) + newCount > MAX_EVIDENCE_PER_CASE) {
            throw new IllegalArgumentException("Mỗi khiếu nại chỉ được lưu tối đa 24 tệp chứng cứ");
        }
        List<ComplaintEvidenceStorageService.StoredEvidence> stored = storageService.store(files);
        evidenceRepository.saveAll(stored.stream().map(item -> new ComplaintEvidence(
                complaint.getId(), actorId, role, item.originalFileName(), item.storedFileName(),
                item.contentType(), item.fileSize())).toList());
    }

    private ComplaintResponse response(Complaint complaint, boolean adminView) {
        Booking booking = bookingRepository.findById(complaint.getBookingId())
                .orElseThrow(() -> new BookingNotFoundException(complaint.getBookingId()));
        List<ComplaintEvidenceResponse> evidence = evidenceRepository
                .findAllByComplaintIdOrderByCreatedAtAsc(complaint.getId()).stream()
                .map(ComplaintEvidenceResponse::from).toList();
        List<ComplaintTimelineResponse> timeline = (adminView
                ? timelineRepository.findAllByComplaintIdOrderByCreatedAtAsc(complaint.getId())
                : timelineRepository.findAllByComplaintIdAndVisibleToCustomerTrueOrderByCreatedAtAsc(complaint.getId()))
                .stream().map(ComplaintTimelineResponse::from).toList();
        long escalations = complaintRepository.countByHotelIdAndViolationReviewRecommendedTrue(complaint.getHotelId());
        return ComplaintResponse.from(complaint, ComplaintBookingContextResponse.from(booking), evidence, timeline, escalations);
    }

    private Complaint requireOwnedHotelComplaint(UUID adminId, String token, UUID complaintId) {
        Complaint complaint = requireComplaint(complaintId);
        if (!ownedHotelIds(adminId, token).contains(complaint.getHotelId())) deny();
        return complaint;
    }
    private Set<UUID> ownedHotelIds(UUID adminId, String token) {
        Map<UUID, UUID> owners = hotelClient.getMyHotels(token).stream()
                .collect(Collectors.toMap(HotelClient.OwnedHotelDetails::id, HotelClient.OwnedHotelDetails::ownerId));
        return owners.entrySet().stream().filter(entry -> adminId.equals(entry.getValue()))
                .map(Map.Entry::getKey).collect(Collectors.toSet());
    }
    private Complaint requireComplaint(UUID id) {
        return complaintRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy khiếu nại"));
    }
    private void requireCustomer(Booking booking, UUID customerId) {
        if (!booking.getCustomerId().equals(customerId)) deny();
    }
    private void ensureOpen(Complaint complaint) {
        if (complaint.getStatus().isTerminal()) throw new IllegalStateException("Khiếu nại đã kết thúc");
    }
    private void requireFiles(List<MultipartFile> files) {
        if (files == null || files.stream().noneMatch(file -> file != null && !file.isEmpty())) {
            throw new IllegalArgumentException("Vui lòng chọn ít nhất một tệp chứng cứ");
        }
    }
    private void notifyCaseStakeholders(Complaint complaint, String title, String content) {
        notificationClient.sendUser(complaint.getHotelOwnerId(), title, content,
                "COMPLAINT_EVIDENCE", "COMPLAINT", "/hotel-admin/complaints");
        if (complaint.getEscalatedAt() != null) notificationClient.sendRole("SYSTEM_ADMIN", title, content,
                "COMPLAINT_EVIDENCE", "COMPLAINT", "/admin/complaints");
    }
    private String customerName(Booking booking) {
        String value = ((booking.getBookerFirstName() == null ? "" : booking.getBookerFirstName()) + " "
                + (booking.getBookerLastName() == null ? "" : booking.getBookerLastName())).trim();
        return value.isEmpty() ? booking.getBookerEmail() : value;
    }
    private String requiredMessage(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Vui lòng nhập nội dung phản hồi");
        return value.trim();
    }
    private String normalizeMessage(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
    private void deny() { throw new AccessDeniedException("Bạn không có quyền truy cập khiếu nại này"); }

    public record EvidenceDownload(Resource resource, String contentType, String fileName) {}
}
