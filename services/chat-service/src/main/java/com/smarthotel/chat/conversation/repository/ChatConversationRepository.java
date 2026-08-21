package com.smarthotel.chat.conversation.repository;

import com.smarthotel.chat.conversation.entity.ChatConversation;
import com.smarthotel.chat.conversation.entity.ConversationStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatConversationRepository extends JpaRepository<ChatConversation, UUID> {

    Optional<ChatConversation> findByBookingId(UUID bookingId);

    Optional<ChatConversation> findFirstByCustomerIdAndHotelIdAndBookingIdIsNotNullAndStatusOrderByLastMessageAtDesc(
            UUID customerId,
            UUID hotelId,
            ConversationStatus status
    );

    Optional<ChatConversation> findByCustomerIdAndHotelIdAndBookingIdIsNullAndStatus(
            UUID customerId,
            UUID hotelId,
            ConversationStatus status
    );

    List<ChatConversation> findAllByCustomerIdOrderByLastMessageAtDesc(UUID customerId);

    List<ChatConversation> findAllByHotelAdminIdOrderByLastMessageAtDesc(UUID hotelAdminId);
}
