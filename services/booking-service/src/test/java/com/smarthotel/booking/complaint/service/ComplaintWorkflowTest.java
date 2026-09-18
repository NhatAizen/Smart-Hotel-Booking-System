package com.smarthotel.booking.complaint.service;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.booking.entity.BookingPaymentStatus;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.complaint.dto.*;
import com.smarthotel.booking.complaint.entity.*;
import com.smarthotel.booking.complaint.media.ComplaintEvidenceStorageService;
import com.smarthotel.booking.complaint.repository.*;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.integration.payment.PaymentClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ComplaintWorkflowTest {
    private final ComplaintRepository complaints = mock(ComplaintRepository.class);
    private final ComplaintEvidenceRepository evidence = mock(ComplaintEvidenceRepository.class);
    private final ComplaintTimelineRepository timeline = mock(ComplaintTimelineRepository.class);
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final ComplaintEvidenceStorageService storage = mock(ComplaintEvidenceStorageService.class);
    private final HotelClient hotels = mock(HotelClient.class);
    private final NotificationClient notifications = mock(NotificationClient.class);
    private final PaymentClient payments = mock(PaymentClient.class);
    private final ComplaintService service = new ComplaintService(complaints, evidence, timeline, bookings,
            storage, hotels, notifications, payments);
    private final UUID hotelId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();
    private final UUID customerId = UUID.randomUUID();
    private final UUID adminId = UUID.randomUUID();
    private final Complaint complaint = new Complaint(UUID.randomUUID(), "ALH-01", customerId, "Khách thử",
            hotelId, ownerId, "Khách sạn thử", null, null, UUID.randomUUID(), "101",
            ComplaintIssueType.SERVICE_QUALITY, "Yêu cầu kiểm tra", "Nội dung khiếu nại", BigDecimal.valueOf(500));
    private final MockMultipartFile proof = new MockMultipartFile("evidence", "proof.pdf", "application/pdf", new byte[]{1});

    @BeforeEach
    void setUp() {
        when(complaints.findById(complaint.getId())).thenReturn(Optional.of(complaint));
        when(hotels.getMyHotels("hotel-token"))
                .thenReturn(List.of(new HotelClient.OwnedHotelDetails(hotelId, ownerId, "Khách sạn thử")));
        Booking booking = mock(Booking.class);
        when(booking.getPaymentOption()).thenReturn(PaymentOption.FULL_PAYMENT);
        when(booking.getPaymentStatus()).thenReturn(BookingPaymentStatus.PAID);
        when(booking.getStatus()).thenReturn(BookingStatus.CONFIRMED);
        when(booking.getPaidAmount()).thenReturn(BigDecimal.valueOf(1000));
        when(bookings.findById(complaint.getBookingId())).thenReturn(Optional.of(booking));
        when(storage.store(any())).thenReturn(List.of());
    }

    @Test
    void hotelCanResolveBeforeSystemGetsInvolved() {
        hotel(HotelComplaintAction.START_REVIEW);
        var result = hotel(HotelComplaintAction.RESOLVE);
        assertThat(result.status()).isEqualTo(ComplaintStatus.RESOLVED);
        assertThat(result.resolvedByRole()).isEqualTo(ComplaintActorRole.HOTEL_ADMIN);
        assertThat(result.escalatedAt()).isNull();
        verify(notifications, never()).sendRole(any(), any(), any(), any(), any(), any());
    }

    @Test
    void hotelDisagreementEscalatesAndSystemCanRejectCustomerClaim() {
        var escalated = hotel(HotelComplaintAction.ESCALATE);
        assertThat(escalated.status()).isEqualTo(ComplaintStatus.ESCALATED);
        verify(notifications).sendRole(eq("SYSTEM_ADMIN"), any(), any(), any(), eq("COMPLAINT"), eq("/admin/complaints"));
        var result = admin(ComplaintStatus.REJECTED, ComplaintResolutionType.REJECTED_CUSTOMER_AT_FAULT, null, false, false);
        assertThat(result.status()).isEqualTo(ComplaintStatus.REJECTED);
        assertThat(result.violationReviewRecommended()).isFalse();
        assertThat(result.resolvedByRole()).isEqualTo(ComplaintActorRole.SYSTEM_ADMIN);
    }

    @Test
    void systemCannotInterveneBeforeHotelEscalatesOrCloseBeforeExecution() {
        assertThatThrownBy(() -> admin(ComplaintStatus.REJECTED, ComplaintResolutionType.REJECTED_CUSTOMER_AT_FAULT, null, false, false))
                .isInstanceOf(IllegalStateException.class);
        complaint.escalate();
        assertThatThrownBy(() -> admin(ComplaintStatus.RESOLVED, null, null, false, false))
                .isInstanceOf(IllegalStateException.class);
        assertThat(complaint.getStatus()).isEqualTo(ComplaintStatus.ESCALATED);
    }

    @Test
    void hotelCannotCloseOrDismissSystemMandate() {
        complaint.escalate();
        admin(ComplaintStatus.HOTEL_ACTION_REQUIRED, ComplaintResolutionType.HOTEL_SUPPORT_REQUIRED, null, true, false);
        assertThatThrownBy(() -> hotel(HotelComplaintAction.RESOLVE)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> hotel(HotelComplaintAction.ESCALATE)).isInstanceOf(IllegalStateException.class);
        assertThat(complaint.getStatus()).isEqualTo(ComplaintStatus.HOTEL_ACTION_REQUIRED);
    }

    @Test
    void remedyNeedsEvidenceThenSystemConfirmationAndPreservesAssessment() {
        complaint.escalate();
        admin(ComplaintStatus.HOTEL_ACTION_REQUIRED, ComplaintResolutionType.HOTEL_SUPPORT_REQUIRED, null, true, false);
        assertThatThrownBy(() -> hotel(HotelComplaintAction.COMPLETE_REQUIRED_ACTION)).isInstanceOf(IllegalArgumentException.class);
        complete(null, null);
        assertThat(complaint.getStatus()).isEqualTo(ComplaintStatus.AWAITING_SYSTEM_CONFIRMATION);
        var result = admin(ComplaintStatus.RESOLVED, null, null, false, false);
        assertThat(result.status()).isEqualTo(ComplaintStatus.RESOLVED);
        assertThat(result.violationReviewRecommended()).isTrue();
    }

    @Test
    void manualRefundRequiresSufficientAmountProofAndExplicitSystemVerification() {
        complaint.escalate();
        admin(ComplaintStatus.HOTEL_ACTION_REQUIRED, ComplaintResolutionType.PARTIAL_REFUND_ACCEPTED, BigDecimal.valueOf(500), true, false);
        assertThatThrownBy(() -> complete(null, BigDecimal.valueOf(400))).isInstanceOf(IllegalArgumentException.class);
        complete(null, BigDecimal.valueOf(500));
        assertThatThrownBy(() -> admin(ComplaintStatus.RESOLVED, null, null, false, false)).isInstanceOf(IllegalArgumentException.class);
        assertThat(admin(ComplaintStatus.RESOLVED, null, null, false, true).status()).isEqualTo(ComplaintStatus.RESOLVED);
        verifyNoInteractions(payments);
    }

    @Test
    void linkedRefundMustBeVerifiedByBothHotelAndSystem() {
        UUID refundId = UUID.randomUUID();
        complaint.escalate();
        admin(ComplaintStatus.HOTEL_ACTION_REQUIRED, ComplaintResolutionType.FULL_REFUND_ACCEPTED, BigDecimal.valueOf(1000), false, false);
        complete(refundId, BigDecimal.valueOf(1000));
        admin(ComplaintStatus.RESOLVED, null, null, false, false);
        verify(payments).requireCompletedRefund("hotel-token", true, refundId, complaint.getBookingId(), BigDecimal.valueOf(1000));
        verify(payments).requireCompletedRefund("admin-token", false, refundId, complaint.getBookingId(), BigDecimal.valueOf(1000));
    }

    @Test
    void incompleteLinkedRefundCannotBeReportedAsCompleted() {
        UUID refundId = UUID.randomUUID();
        complaint.escalate();
        admin(ComplaintStatus.HOTEL_ACTION_REQUIRED, ComplaintResolutionType.FULL_REFUND_ACCEPTED, BigDecimal.valueOf(1000), false, false);
        doThrow(new IllegalStateException("Chưa hoàn tiền")).when(payments)
                .requireCompletedRefund(any(), eq(true), any(), any(), any());
        assertThatThrownBy(() -> complete(refundId, BigDecimal.valueOf(1000))).isInstanceOf(IllegalStateException.class);
        assertThat(complaint.getStatus()).isEqualTo(ComplaintStatus.HOTEL_ACTION_REQUIRED);
    }

    @Test
    void cannotOrderRefundAbovePaidAmountOrCallPartialAmountFullRefund() {
        complaint.escalate();
        assertThatThrownBy(() -> admin(ComplaintStatus.HOTEL_ACTION_REQUIRED, ComplaintResolutionType.PARTIAL_REFUND_ACCEPTED, BigDecimal.valueOf(1001), false, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> admin(ComplaintStatus.HOTEL_ACTION_REQUIRED, ComplaintResolutionType.FULL_REFUND_ACCEPTED, BigDecimal.valueOf(500), false, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(complaint.getStatus()).isEqualTo(ComplaintStatus.ESCALATED);
    }

    @Test
    void customerEvidenceReturnsToCorrectReviewer() {
        hotel(HotelComplaintAction.REQUEST_CUSTOMER_EVIDENCE);
        service.customerAddEvidence(customerId, complaint.getId(), "Bổ sung", List.of(proof));
        assertThat(complaint.getStatus()).isEqualTo(ComplaintStatus.UNDER_REVIEW);
        complaint.escalate();
        admin(ComplaintStatus.WAITING_FOR_CUSTOMER, null, null, false, false);
        service.customerAddEvidence(customerId, complaint.getId(), "Bổ sung", List.of(proof));
        assertThat(complaint.getStatus()).isEqualTo(ComplaintStatus.SYSTEM_REVIEW);
    }

    @Test
    void hotelExplanationDoesNotTakeCaseAwayFromSystem() {
        complaint.escalate();
        service.hotelRespond(ownerId, "hotel-token", complaint.getId(), "Giải trình", List.of());
        assertThat(complaint.getStatus()).isEqualTo(ComplaintStatus.ESCALATED);
    }

    @Test
    void systemDecisionCannotBeHiddenFromParties() {
        complaint.escalate();
        admin(ComplaintStatus.HOTEL_ACTION_REQUIRED, ComplaintResolutionType.HOTEL_SUPPORT_REQUIRED, null, true, false);
        var captor = ArgumentCaptor.forClass(ComplaintTimelineEntry.class);
        verify(timeline).save(captor.capture());
        assertThat(captor.getValue().isVisibleToCustomer()).isTrue();
    }

    @Test
    void adminInboxOnlyQueriesEscalatedCases() {
        service.adminList(null);
        verify(complaints).findAllByEscalatedAtIsNotNullOrderByCreatedAtDesc();
        verify(complaints, never()).findAllByOrderByCreatedAtDesc();
    }

    private ComplaintResponse hotel(HotelComplaintAction action) {
        return service.hotelAct(ownerId, "hotel-token", complaint.getId(),
                new HotelComplaintActionRequest(action, "Nội dung và căn cứ xử lý", null, null), List.of());
    }
    private ComplaintResponse complete(UUID refundId, BigDecimal amount) {
        return service.hotelAct(ownerId, "hotel-token", complaint.getId(),
                new HotelComplaintActionRequest(HotelComplaintAction.COMPLETE_REQUIRED_ACTION,
                        "Đã thực hiện, kèm chứng từ", refundId, amount), List.of(proof));
    }
    private ComplaintResponse admin(ComplaintStatus status, ComplaintResolutionType resolution,
                                     BigDecimal amount, boolean negative, boolean verified) {
        return service.adminUpdate(adminId, "admin-token", complaint.getId(),
                new AdminComplaintUpdateRequest(status, resolution, "Căn cứ phân xử và yêu cầu thực hiện",
                        null, ComplaintSeverity.NORMAL, false, amount, negative, verified));
    }
}
