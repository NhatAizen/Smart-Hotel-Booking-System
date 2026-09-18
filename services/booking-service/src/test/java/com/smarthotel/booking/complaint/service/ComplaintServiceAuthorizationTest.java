package com.smarthotel.booking.complaint.service;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingPaymentStatus;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.complaint.dto.CreateComplaintRequest;
import com.smarthotel.booking.complaint.dto.AdminComplaintUpdateRequest;
import com.smarthotel.booking.complaint.entity.Complaint;
import com.smarthotel.booking.complaint.entity.ComplaintActorRole;
import com.smarthotel.booking.complaint.entity.ComplaintEvidence;
import com.smarthotel.booking.complaint.entity.ComplaintIssueType;
import com.smarthotel.booking.complaint.entity.ComplaintResolutionType;
import com.smarthotel.booking.complaint.entity.ComplaintSeverity;
import com.smarthotel.booking.complaint.entity.ComplaintStatus;
import com.smarthotel.booking.complaint.media.ComplaintEvidenceStorageService;
import com.smarthotel.booking.complaint.repository.ComplaintEvidenceRepository;
import com.smarthotel.booking.complaint.repository.ComplaintRepository;
import com.smarthotel.booking.complaint.repository.ComplaintTimelineRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.integration.payment.PaymentClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.core.io.Resource;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ComplaintServiceAuthorizationTest {
    @Mock ComplaintRepository complaintRepository;
    @Mock ComplaintEvidenceRepository evidenceRepository;
    @Mock ComplaintTimelineRepository timelineRepository;
    @Mock BookingRepository bookingRepository;
    @Mock ComplaintEvidenceStorageService storageService;
    @Mock HotelClient hotelClient;
    @Mock NotificationClient notificationClient;
    @Mock PaymentClient paymentClient;
    @InjectMocks ComplaintService service;

    @Test
    void customerCannotCreateComplaintForAnotherCustomersBooking() {
        UUID bookingId = UUID.randomUUID();
        UUID owner = UUID.randomUUID();
        Booking booking = mock(Booking.class);
        when(booking.getCustomerId()).thenReturn(owner);
        when(bookingRepository.findById(bookingId)).thenReturn(Optional.of(booking));

        CreateComplaintRequest request = new CreateComplaintRequest(
                bookingId, ComplaintIssueType.OTHER, "Vấn đề", "Mô tả đầy đủ", null
        );

        assertThatThrownBy(() -> service.create(UUID.randomUUID(), request, List.of()))
                .isInstanceOf(AccessDeniedException.class);
        verify(hotelClient, never()).getHotel(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void hotelAdminCannotReadComplaintOfAnotherHotel() {
        UUID complaintId = UUID.randomUUID();
        UUID hotelA = UUID.randomUUID();
        UUID hotelB = UUID.randomUUID();
        UUID adminB = UUID.randomUUID();
        Complaint complaint = complaint(hotelA, UUID.randomUUID());
        when(complaintRepository.findById(complaintId)).thenReturn(Optional.of(complaint));
        when(hotelClient.getMyHotels("token-b"))
                .thenReturn(List.of(new HotelClient.OwnedHotelDetails(hotelB, adminB, "Hotel B")));

        assertThatThrownBy(() -> service.hotelGet(adminB, "token-b", complaintId))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void customerCannotReadAnotherCustomersComplaint() {
        UUID complaintId = UUID.randomUUID();
        Complaint complaint = complaint(UUID.randomUUID(), UUID.randomUUID());
        when(complaintRepository.findById(complaintId)).thenReturn(Optional.of(complaint));

        assertThatThrownBy(() -> service.customerGet(UUID.randomUUID(), complaintId))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void customerCannotDownloadAnotherCustomersEvidence() {
        UUID complaintId = UUID.randomUUID();
        Complaint complaint = complaint(UUID.randomUUID(), UUID.randomUUID());
        when(complaintRepository.findById(complaintId)).thenReturn(Optional.of(complaint));

        assertThatThrownBy(() -> service.evidence(UUID.randomUUID(), "CUSTOMER", null,
                complaintId, UUID.randomUUID())).isInstanceOf(AccessDeniedException.class);
        verify(evidenceRepository, never()).findByIdAndComplaintId(any(), any());
    }

    @Test
    void hotelAdminCannotDownloadEvidenceOfAnotherHotel() {
        UUID complaintId = UUID.randomUUID();
        UUID hotelA = UUID.randomUUID();
        UUID hotelB = UUID.randomUUID();
        UUID adminB = UUID.randomUUID();
        when(complaintRepository.findById(complaintId))
                .thenReturn(Optional.of(complaint(hotelA, UUID.randomUUID())));
        when(hotelClient.getMyHotels("token-b"))
                .thenReturn(List.of(new HotelClient.OwnedHotelDetails(hotelB, adminB, "Hotel B")));

        assertThatThrownBy(() -> service.evidence(adminB, "HOTEL_ADMIN", "token-b",
                complaintId, UUID.randomUUID())).isInstanceOf(AccessDeniedException.class);
        verify(evidenceRepository, never()).findByIdAndComplaintId(any(), any());
    }

    @Test
    void systemAdminCanDownloadPrivateEvidenceThroughAuthorizedService() {
        UUID complaintId = UUID.randomUUID();
        Complaint complaint = complaint(UUID.randomUUID(), UUID.randomUUID());
        ComplaintEvidence evidence = new ComplaintEvidence(complaintId, UUID.randomUUID(),
                ComplaintActorRole.CUSTOMER, "proof.png", "stored.png", "image/png", 128);
        Resource resource = mock(Resource.class);
        when(complaintRepository.findById(complaintId)).thenReturn(Optional.of(complaint));
        when(evidenceRepository.findByIdAndComplaintId(evidence.getId(), complaintId))
                .thenReturn(Optional.of(evidence));
        when(storageService.load("stored.png")).thenReturn(resource);

        ComplaintService.EvidenceDownload result = service.evidence(UUID.randomUUID(), "SYSTEM_ADMIN", null,
                complaintId, evidence.getId());

        assertThat(result.resource()).isSameAs(resource);
        assertThat(result.fileName()).isEqualTo("proof.png");
    }

    @Test
    void createNotifiesCustomerAndHotelWithoutEscalatingToSystem() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID hotelId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        Booking booking = booking(bookingId, customerId, hotelId, roomId);
        when(bookingRepository.findById(bookingId)).thenReturn(Optional.of(booking));
        when(hotelClient.getHotel(hotelId)).thenReturn(new HotelClient.HotelDetails(
                hotelId, ownerId, "Hotel A", "Địa chỉ", "Hà Nội", null, null));
        when(hotelClient.getRoom(roomId)).thenReturn(new HotelClient.RoomDetails(
                roomId, hotelId, null, "A101", 1, "AVAILABLE", null, null));
        when(complaintRepository.save(any(Complaint.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.create(customerId, new CreateComplaintRequest(
                bookingId, ComplaintIssueType.OTHER, "Vấn đề", "Mô tả đầy đủ", null), List.of());

        verify(notificationClient).sendUser(eq(customerId), any(), any(), eq("COMPLAINT_SUBMITTED"),
                eq("COMPLAINT"), eq("/customer/complaints"));
        verify(notificationClient).sendUser(eq(ownerId), any(), any(), eq("COMPLAINT_SUBMITTED"),
                eq("COMPLAINT"), eq("/hotel-admin/complaints"));
        verify(notificationClient, never()).sendRole(eq("SYSTEM_ADMIN"), any(), any(), eq("COMPLAINT_SUBMITTED"),
                eq("COMPLAINT"), eq("/admin/complaints"));
    }

    @Test
    void adminCannotLinkRefundFromAnotherBooking() {
        UUID complaintId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        UUID refundId = UUID.randomUUID();
        Complaint complaint = complaintWithBooking(bookingId, UUID.randomUUID(), UUID.randomUUID());
        complaint.escalate();
        when(complaintRepository.findById(complaintId)).thenReturn(Optional.of(complaint));
        doThrow(new IllegalArgumentException("Yêu cầu hoàn tiền không thuộc booking của khiếu nại"))
                .when(paymentClient).requireRefundForBooking("admin-token", refundId, bookingId);
        AdminComplaintUpdateRequest request = new AdminComplaintUpdateRequest(
                ComplaintStatus.HOTEL_ACTION_REQUIRED, ComplaintResolutionType.HOTEL_SUPPORT_REQUIRED,
                "Chấp nhận theo chứng cứ", refundId, ComplaintSeverity.NORMAL, true);

        assertThatThrownBy(() -> service.adminUpdate(UUID.randomUUID(), "admin-token", complaintId, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("không thuộc booking");
        verify(timelineRepository, never()).save(any());
    }

    private Complaint complaint(UUID hotelId, UUID customerId) {
        return complaintWithBooking(UUID.randomUUID(), hotelId, customerId);
    }

    private Complaint complaintWithBooking(UUID bookingId, UUID hotelId, UUID customerId) {
        return new Complaint(bookingId, "BK-TEST", customerId, "Khách thử",
                hotelId, UUID.randomUUID(), "Hotel A", UUID.randomUUID(), "Deluxe",
                UUID.randomUUID(), "A101", ComplaintIssueType.OTHER, "Vấn đề", "Mô tả", null);
    }

    private Booking booking(UUID bookingId, UUID customerId, UUID hotelId, UUID roomId) {
        Booking booking = mock(Booking.class);
        when(booking.getId()).thenReturn(bookingId);
        when(booking.getBookingCode()).thenReturn("BK-TEST");
        when(booking.getCustomerId()).thenReturn(customerId);
        when(booking.getHotelId()).thenReturn(hotelId);
        when(booking.getRoomId()).thenReturn(roomId);
        when(booking.getBookerFirstName()).thenReturn("Khách");
        when(booking.getBookerLastName()).thenReturn("Thử");
        when(booking.getPaymentOption()).thenReturn(PaymentOption.FULL_PAYMENT);
        when(booking.getPaymentStatus()).thenReturn(BookingPaymentStatus.PAID);
        when(booking.getStatus()).thenReturn(BookingStatus.CONFIRMED);
        return booking;
    }
}
