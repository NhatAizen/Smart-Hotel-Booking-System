package com.smarthotel.chat.message.repository;

import com.smarthotel.chat.message.entity.ChatMessage;
import com.smarthotel.chat.message.entity.ChatSenderType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

    List<ChatMessage> findAllByConversationIdOrderByCreatedAtAsc(UUID conversationId);

    Optional<ChatMessage> findTopByConversationIdOrderByCreatedAtDesc(UUID conversationId);

    List<ChatMessage> findAllByConversationIdAndReadAtIsNullAndSenderTypeInOrderByCreatedAtAsc(
            UUID conversationId,
            Collection<ChatSenderType> senderTypes
    );

    long countByConversationIdAndReadAtIsNullAndSenderTypeIn(
            UUID conversationId,
            Collection<ChatSenderType> senderTypes
    );
}
