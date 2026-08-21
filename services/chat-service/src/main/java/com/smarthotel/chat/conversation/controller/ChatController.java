package com.smarthotel.chat.conversation.controller;

import com.smarthotel.chat.conversation.dto.*;
import com.smarthotel.chat.conversation.service.ChatService;
import com.smarthotel.chat.message.dto.ChatMessageResponse;
import com.smarthotel.chat.message.dto.SendMessageRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/chat/bookings/{bookingId}/conversation")
    public ResponseEntity<ConversationResponse> ensureCustomerConversation(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chatService.ensureCustomerConversation(userId(jwt), bookingId));
    }

    @PostMapping("/chat/hotels/{hotelId}/conversation")
    public ResponseEntity<ConversationResponse> ensureHotelConversation(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chatService.ensureHotelConversation(userId(jwt), hotelId));
    }

    @GetMapping("/chat/conversations")
    public ResponseEntity<List<ConversationResponse>> getCustomerConversations(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(chatService.getCustomerConversations(userId(jwt)));
    }

    @GetMapping("/chat/conversations/{conversationId}/messages")
    public ResponseEntity<List<ChatMessageResponse>> getCustomerMessages(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId
    ) {
        return ResponseEntity.ok(chatService.getCustomerMessages(userId(jwt), conversationId));
    }

    @PostMapping("/chat/conversations/{conversationId}/messages")
    public ResponseEntity<ChatMessageResponse> sendCustomerMessage(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID conversationId,
            @Valid @RequestBody SendMessageRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chatService.sendCustomerMessage(
                        userId(jwt),
                        conversationId,
                        request.content(),
                        bearerToken(authorization)
                ));
    }

    @PatchMapping("/chat/conversations/{conversationId}/read")
    public ResponseEntity<Map<String, Integer>> markCustomerRead(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId
    ) {
        return ResponseEntity.ok(Map.of(
                "updated",
                chatService.markCustomerRead(userId(jwt), conversationId)
        ));
    }

    @PostMapping("/chat/conversations/{conversationId}/arrival")
    public ResponseEntity<ConversationResponse> updateArrival(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId,
            @Valid @RequestBody ArrivalUpdateRequest request
    ) {
        return ResponseEntity.ok(
                chatService.updateArrival(userId(jwt), conversationId, request)
        );
    }

    @PostMapping("/chat/conversations/{conversationId}/late-checkout-request")
    public ResponseEntity<ChatMessageResponse> requestLateCheckout(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId,
            @Valid @RequestBody LateCheckoutRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chatService.requestLateCheckout(
                        userId(jwt),
                        conversationId,
                        request
                ));
    }

    @GetMapping("/hotel-admin/chat/conversations")
    public ResponseEntity<List<ConversationResponse>> getHotelAdminConversations(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(
                chatService.getHotelAdminConversations(userId(jwt))
        );
    }

    @GetMapping("/hotel-admin/chat/conversations/{conversationId}/messages")
    public ResponseEntity<List<ChatMessageResponse>> getHotelAdminMessages(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId
    ) {
        return ResponseEntity.ok(
                chatService.getHotelAdminMessages(userId(jwt), conversationId)
        );
    }

    @PostMapping("/hotel-admin/chat/conversations/{conversationId}/messages")
    public ResponseEntity<ChatMessageResponse> sendHotelAdminMessage(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId,
            @Valid @RequestBody SendMessageRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chatService.sendHotelAdminMessage(
                        userId(jwt),
                        conversationId,
                        request.content()
                ));
    }

    @PatchMapping("/hotel-admin/chat/conversations/{conversationId}/read")
    public ResponseEntity<Map<String, Integer>> markHotelAdminRead(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId
    ) {
        return ResponseEntity.ok(Map.of(
                "updated",
                chatService.markHotelAdminRead(userId(jwt), conversationId)
        ));
    }

    @PatchMapping("/hotel-admin/chat/conversations/{conversationId}/takeover")
    public ResponseEntity<ConversationResponse> setHumanTakeover(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId,
            @RequestBody TakeoverRequest request
    ) {
        return ResponseEntity.ok(
                chatService.setHumanTakeover(
                        userId(jwt),
                        conversationId,
                        request.humanTakeover()
                )
        );
    }

    private UUID userId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }

    private String bearerToken(String authorization) {
        if (authorization == null) return "";
        return authorization.replaceFirst("(?i)^Bearer\\s+", "").trim();
    }
}
