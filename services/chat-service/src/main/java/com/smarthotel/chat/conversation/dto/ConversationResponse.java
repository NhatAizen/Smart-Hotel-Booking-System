package com.smarthotel.chat.conversation.dto;

import com.smarthotel.chat.conversation.entity.ArrivalStatus;
import com.smarthotel.chat.conversation.entity.ChatConversation;
import com.smarthotel.chat.conversation.entity.ConversationStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record ConversationResponse(
        UUID id,
        UUID bookingId,
        String bookingCode,
        UUID hotelId,
        String hotelName,
        UUID customerId,
        UUID hotelAdminId,
        LocalDate checkIn,
        LocalDate checkOut,
        LocalTime checkInTime,
        LocalTime checkOutTime,
        ConversationStatus status,
        boolean autoReplyEnabled,
        boolean humanTakeover,
        ArrivalStatus arrivalStatus,
        LocalTime expectedArrivalTime,
        long unreadCount,
        String lastMessage,
        Instant lastMessageAt,
        Instant createdAt
) {
    public static ConversationResponse from(
            ChatConversation conversation,
            long unreadCount,
            String lastMessage
    ) {
        return new ConversationResponse(
                conversation.getId(),
                conversation.getBookingId(),
                conversation.getBookingCode(),
                conversation.getHotelId(),
                conversation.getHotelName(),
                conversation.getCustomerId(),
                conversation.getHotelAdminId(),
                conversation.getCheckIn(),
                conversation.getCheckOut(),
                conversation.getCheckInTime(),
                conversation.getCheckOutTime(),
                conversation.getStatus(),
                conversation.isAutoReplyEnabled(),
                conversation.isHumanTakeover(),
                conversation.getArrivalStatus(),
                conversation.getExpectedArrivalTime(),
                unreadCount,
                lastMessage,
                conversation.getLastMessageAt(),
                conversation.getCreatedAt()
        );
    }
}
