package com.smarthotel.booking.complaint.dto;

import com.smarthotel.booking.complaint.entity.Complaint;
import com.smarthotel.booking.complaint.entity.ComplaintIssueType;
import com.smarthotel.booking.complaint.entity.ComplaintResolutionType;
import com.smarthotel.booking.complaint.entity.ComplaintSeverity;
import com.smarthotel.booking.complaint.entity.ComplaintStatus;
import com.smarthotel.booking.complaint.entity.ComplaintActorRole;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ComplaintResponse(
        UUID id, String complaintCode, UUID bookingId, String bookingCode,
        UUID customerId, String customerName, UUID hotelId, UUID hotelOwnerId, String hotelName,
        UUID roomTypeId, String roomTypeName, UUID roomId, String roomNumber,
        ComplaintIssueType issueType, String title, String description, BigDecimal disputedAmount,
        ComplaintStatus status, ComplaintSeverity severity, ComplaintResolutionType resolutionType,
        String resolutionNote, UUID refundRequestId, boolean violationReviewRecommended,
        long priorViolationEscalationsForHotel, UUID resolvedBy, Instant resolvedAt, Instant cancelledAt,
        Instant createdAt, Instant updatedAt, ComplaintBookingContextResponse booking,
        List<ComplaintEvidenceResponse> evidence, List<ComplaintTimelineResponse> timeline,
        Instant escalatedAt, Instant hotelCompletedAt, BigDecimal requiredRefundAmount,
        ComplaintActorRole resolvedByRole, BigDecimal hotelReportedRefundAmount
) {
    public static ComplaintResponse from(Complaint complaint, ComplaintBookingContextResponse booking,
                                         List<ComplaintEvidenceResponse> evidence,
                                         List<ComplaintTimelineResponse> timeline,
                                         long priorViolationEscalationsForHotel) {
        return new ComplaintResponse(
                complaint.getId(), complaint.getComplaintCode(), complaint.getBookingId(), complaint.getBookingCode(),
                complaint.getCustomerId(), complaint.getCustomerNameSnapshot(), complaint.getHotelId(),
                complaint.getHotelOwnerId(), complaint.getHotelNameSnapshot(), complaint.getRoomTypeId(),
                complaint.getRoomTypeNameSnapshot(), complaint.getRoomId(), complaint.getRoomNumberSnapshot(),
                complaint.getIssueType(), complaint.getTitle(), complaint.getDescription(), complaint.getDisputedAmount(),
                complaint.getStatus(), complaint.getSeverity(), complaint.getResolutionType(), complaint.getResolutionNote(),
                complaint.getRefundRequestId(), complaint.isViolationReviewRecommended(), priorViolationEscalationsForHotel,
                complaint.getResolvedBy(), complaint.getResolvedAt(), complaint.getCancelledAt(), complaint.getCreatedAt(),
                complaint.getUpdatedAt(), booking, evidence, timeline, complaint.getEscalatedAt(),
                complaint.getHotelCompletedAt(), complaint.getRequiredRefundAmount(), complaint.getResolvedByRole(),
                complaint.getHotelReportedRefundAmount()
        );
    }
}
