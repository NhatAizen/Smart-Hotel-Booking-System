package com.smarthotel.chat.conversation.service;

import com.smarthotel.chat.conversation.dto.*;
import com.smarthotel.chat.conversation.entity.ArrivalStatus;
import com.smarthotel.chat.conversation.entity.ChatConversation;
import com.smarthotel.chat.conversation.entity.ConversationStatus;
import com.smarthotel.chat.conversation.repository.ChatConversationRepository;
import com.smarthotel.chat.integration.ai.AiClient;
import com.smarthotel.chat.integration.booking.BookingClient;
import com.smarthotel.chat.integration.hotel.HotelClient;
import com.smarthotel.chat.integration.notification.NotificationClient;
import com.smarthotel.chat.message.dto.ChatMessageResponse;
import com.smarthotel.chat.message.entity.ChatMessage;
import com.smarthotel.chat.message.entity.ChatMessageType;
import com.smarthotel.chat.message.entity.ChatSenderType;
import com.smarthotel.chat.message.repository.ChatMessageRepository;
import com.smarthotel.chat.realtime.ChatRealtimePublisher;
import com.smarthotel.chat.reminder.service.ReminderPlanService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class ChatService {

    private final ChatConversationRepository conversationRepository;
    private final ChatMessageRepository messageRepository;
    private final BookingClient bookingClient;
    private final HotelClient hotelClient;
    private final NotificationClient notificationClient;
    private final AiClient aiClient;
    private final ChatRealtimePublisher realtimePublisher;
    private final ReminderPlanService reminderPlanService;

    public ChatService(
            ChatConversationRepository conversationRepository,
            ChatMessageRepository messageRepository,
            BookingClient bookingClient,
            HotelClient hotelClient,
            NotificationClient notificationClient,
            AiClient aiClient,
            ChatRealtimePublisher realtimePublisher,
            ReminderPlanService reminderPlanService
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.bookingClient = bookingClient;
        this.hotelClient = hotelClient;
        this.notificationClient = notificationClient;
        this.aiClient = aiClient;
        this.realtimePublisher = realtimePublisher;
        this.reminderPlanService = reminderPlanService;
    }

    public ConversationResponse ensureCustomerConversation(UUID customerId, UUID bookingId) {
        BookingClient.BookingSnapshot booking = bookingClient.getBooking(bookingId);
        if (!customerId.equals(booking.customerId())) {
            throw new IllegalArgumentException("Booking không thuộc tài khoản hiện tại");
        }

        ChatConversation conversation = ensureConversation(booking);
        return toResponse(conversation, ChatSenderType.CUSTOMER);
    }

    public ConversationResponse ensureHotelConversation(UUID customerId, UUID hotelId) {
        LocalDate today = LocalDate.now();

        ChatConversation activeBookingConversation = conversationRepository
                .findAllByCustomerIdOrderByLastMessageAtDesc(customerId)
                .stream()
                .filter(item -> hotelId.equals(item.getHotelId()))
                .filter(item -> item.getStatus() == ConversationStatus.OPEN)
                .filter(item -> item.getBookingId() != null)
                .filter(item -> item.getCheckOut() == null || !item.getCheckOut().isBefore(today))
                .findFirst()
                .orElse(null);

        ChatConversation conversation = activeBookingConversation != null
                ? activeBookingConversation
                : conversationRepository
                .findByCustomerIdAndHotelIdAndBookingIdIsNullAndStatus(
                        customerId,
                        hotelId,
                        ConversationStatus.OPEN
                )
                .orElseGet(() -> createGeneralConversation(customerId, hotelId));

        return toResponse(conversation, ChatSenderType.CUSTOMER);
    }

    public ChatConversation ensureConversation(BookingClient.BookingSnapshot booking) {
        return conversationRepository.findByBookingId(booking.id())
                .orElseGet(() -> createConversation(booking));
    }

    public List<ConversationResponse> getCustomerConversations(UUID customerId) {
        return conversationRepository
                .findAllByCustomerIdOrderByLastMessageAtDesc(customerId)
                .stream()
                .map(item -> toResponse(item, ChatSenderType.CUSTOMER))
                .toList();
    }

    public List<ConversationResponse> getHotelAdminConversations(UUID hotelAdminId) {
        return conversationRepository
                .findAllByHotelAdminIdOrderByLastMessageAtDesc(hotelAdminId)
                .stream()
                .map(item -> toResponse(item, ChatSenderType.HOTEL_ADMIN))
                .toList();
    }

    public List<ChatMessageResponse> getCustomerMessages(UUID customerId, UUID conversationId) {
        ChatConversation conversation = requireCustomerConversation(customerId, conversationId);
        return getMessages(conversation);
    }

    public List<ChatMessageResponse> getHotelAdminMessages(UUID hotelAdminId, UUID conversationId) {
        ChatConversation conversation = requireHotelAdminConversation(hotelAdminId, conversationId);
        return getMessages(conversation);
    }

    public ChatMessageResponse sendCustomerMessage(
            UUID customerId,
            UUID conversationId,
            String content,
            String bearerToken
    ) {
        ChatConversation conversation = requireCustomerConversation(customerId, conversationId);
        requireOpen(conversation);

        ChatMessage message = saveMessage(
                conversation,
                ChatSenderType.CUSTOMER,
                customerId,
                ChatMessageType.TEXT,
                content,
                null
        );

        notificationClient.sendUser(
                conversation.getHotelAdminId(),
                "Tin nhắn mới từ khách",
                conversation.getBookingId() == null
                        ? conversation.getHotelName() + ": " + preview(content)
                        : "Booking " + safe(conversation.getBookingCode()) + ": " + preview(content),
                "CHAT_MESSAGE",
                "CHAT",
                "/hotel-admin/messages"
        );

        if (conversation.isAutoReplyEnabled() && !conversation.isHumanTakeover()) {
            createHotelBotReply(conversation, content, bearerToken);
        }

        return ChatMessageResponse.from(message);
    }

    public ChatMessageResponse sendHotelAdminMessage(
            UUID hotelAdminId,
            UUID conversationId,
            String content
    ) {
        ChatConversation conversation = requireHotelAdminConversation(hotelAdminId, conversationId);
        requireOpen(conversation);

        ChatMessage message = saveMessage(
                conversation,
                ChatSenderType.HOTEL_ADMIN,
                hotelAdminId,
                ChatMessageType.TEXT,
                content,
                null
        );

        notificationClient.sendUser(
                conversation.getCustomerId(),
                "Khách sạn vừa nhắn cho bạn",
                conversation.getHotelName() + ": " + preview(content),
                "CHAT_MESSAGE",
                "CHAT",
                conversation.getBookingId() == null
                        ? "/hotels/" + conversation.getHotelId()
                        : "/customer/bookings"
        );

        return ChatMessageResponse.from(message);
    }

    public ConversationResponse setHumanTakeover(
            UUID hotelAdminId,
            UUID conversationId,
            boolean humanTakeover
    ) {
        ChatConversation conversation = requireHotelAdminConversation(hotelAdminId, conversationId);
        conversation.setHumanTakeover(humanTakeover);
        conversationRepository.save(conversation);

        String text = humanTakeover
                ? "Nhân viên khách sạn đã tiếp quản cuộc trò chuyện. Trợ lý tự động tạm dừng."
                : "Trợ lý tự động của khách sạn đã được bật lại.";

        saveMessage(
                conversation,
                ChatSenderType.SYSTEM,
                null,
                ChatMessageType.SYSTEM,
                text,
                null
        );

        return toResponse(conversation, ChatSenderType.HOTEL_ADMIN);
    }

    public ConversationResponse updateArrival(
            UUID customerId,
            UUID conversationId,
            ArrivalUpdateRequest request
    ) {
        ChatConversation conversation = requireCustomerConversation(customerId, conversationId);
        requireOpen(conversation);
        requireBookingLinked(conversation);

        if (request.status() == ArrivalStatus.ARRIVING_LATE && request.expectedArrivalTime() == null) {
            throw new IllegalArgumentException("Vui lòng chọn giờ dự kiến đến khách sạn");
        }

        if (request.status() != ArrivalStatus.CONFIRMED
                && request.status() != ArrivalStatus.ARRIVING_LATE
                && request.status() != ArrivalStatus.NEEDS_HELP) {
            throw new IllegalArgumentException("Trạng thái xác nhận đến không hợp lệ");
        }

        conversation.updateArrival(request.status(), request.expectedArrivalTime());
        conversationRepository.save(conversation);

        String text = switch (request.status()) {
            case CONFIRMED -> "Khách đã xác nhận sẽ đến nhận phòng đúng kế hoạch.";
            case ARRIVING_LATE -> "Khách báo sẽ đến trễ, dự kiến khoảng " + request.expectedArrivalTime() + ".";
            case NEEDS_HELP -> "Khách cần khách sạn hỗ trợ trước khi nhận phòng.";
            default -> "Đã cập nhật kế hoạch đến khách sạn.";
        };

        saveMessage(
                conversation,
                ChatSenderType.SYSTEM,
                null,
                ChatMessageType.ACTION,
                text,
                "{\"action\":\"ARRIVAL_STATUS\",\"status\":\"" + request.status().name() + "\"}"
        );

        notificationClient.sendUser(
                conversation.getHotelAdminId(),
                "Cập nhật kế hoạch đến của khách",
                "Booking " + safe(conversation.getBookingCode()) + ": " + text,
                "CHAT_MESSAGE",
                "CHAT",
                "/hotel-admin/messages"
        );

        return toResponse(conversation, ChatSenderType.CUSTOMER);
    }

    public ChatMessageResponse requestLateCheckout(
            UUID customerId,
            UUID conversationId,
            LateCheckoutRequest request
    ) {
        ChatConversation conversation = requireCustomerConversation(customerId, conversationId);
        requireOpen(conversation);
        requireBookingLinked(conversation);

        String note = request.note() == null || request.note().isBlank()
                ? ""
                : " - " + request.note().trim();

        String text = "Khách yêu cầu trả phòng muộn lúc "
                + request.requestedCheckoutTime()
                + note
                + ". Yêu cầu cần Hotel Admin xác nhận.";

        ChatMessage message = saveMessage(
                conversation,
                ChatSenderType.CUSTOMER,
                customerId,
                ChatMessageType.ACTION,
                text,
                "{\"action\":\"LATE_CHECKOUT_REQUEST\",\"requestedCheckoutTime\":\""
                        + request.requestedCheckoutTime() + "\"}"
        );

        conversation.setHumanTakeover(true);
        conversationRepository.save(conversation);

        notificationClient.sendUser(
                conversation.getHotelAdminId(),
                "Yêu cầu trả phòng muộn",
                "Booking " + safe(conversation.getBookingCode())
                        + " muốn trả lúc " + request.requestedCheckoutTime() + ".",
                "CHECKOUT_REMINDER",
                "BOOKING",
                "/hotel-admin/messages"
        );

        return ChatMessageResponse.from(message);
    }

    public int markCustomerRead(UUID customerId, UUID conversationId) {
        ChatConversation conversation = requireCustomerConversation(customerId, conversationId);
        return markRead(conversation, ChatSenderType.CUSTOMER);
    }

    public int markHotelAdminRead(UUID hotelAdminId, UUID conversationId) {
        ChatConversation conversation = requireHotelAdminConversation(hotelAdminId, conversationId);
        return markRead(conversation, ChatSenderType.HOTEL_ADMIN);
    }

    public ChatConversation findConversation(UUID conversationId) {
        return conversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy cuộc trò chuyện"));
    }

    public ChatMessageResponse addSystemMessage(
            ChatConversation conversation,
            String content,
            ChatMessageType type,
            String metadataJson
    ) {
        return ChatMessageResponse.from(saveMessage(
                conversation,
                ChatSenderType.HOTEL_BOT,
                null,
                type,
                content,
                metadataJson
        ));
    }

    private ChatConversation createGeneralConversation(UUID customerId, UUID hotelId) {
        HotelClient.HotelSnapshot hotel = hotelClient.getHotel(hotelId);
        if (hotel.ownerId() == null) {
            throw new IllegalStateException("Khách sạn chưa có Hotel Admin");
        }

        ChatConversation conversation = new ChatConversation(
                hotelId,
                customerId,
                hotel.ownerId(),
                hotel.name(),
                hotel.checkInTime() == null ? LocalTime.of(14, 0) : hotel.checkInTime(),
                hotel.checkOutTime() == null ? LocalTime.NOON : hotel.checkOutTime()
        );

        conversationRepository.save(conversation);

        String welcome = "Xin chào! Đây là hộp chat của " + conversation.getHotelName() + ". "
                + "Trợ lý tự động có thể hỗ trợ bạn về giờ nhận/trả phòng, địa chỉ, loại phòng, tiện nghi và giá niêm yết. "
                + "Nếu câu hỏi cần nhân viên quyết định, mình sẽ chuyển trực tiếp cho Hotel Admin.";

        saveMessage(
                conversation,
                ChatSenderType.HOTEL_BOT,
                null,
                ChatMessageType.SYSTEM,
                welcome,
                "{\"event\":\"GENERAL_CONVERSATION_OPENED\"}"
        );

        return conversation;
    }

    private ChatConversation createConversation(BookingClient.BookingSnapshot booking) {
        String status = safe(booking.status()).toUpperCase(Locale.ROOT);
        if (!List.of("CONFIRMED", "CHECKED_IN", "CHECKED_OUT").contains(status)) {
            throw new IllegalStateException(
                    "Chat với khách sạn chỉ mở sau khi booking đã được xác nhận"
            );
        }

        HotelClient.HotelSnapshot hotel = hotelClient.getHotel(booking.hotelId());
        if (hotel.ownerId() == null) {
            throw new IllegalStateException("Khách sạn chưa có Hotel Admin");
        }

        ChatConversation conversation = new ChatConversation(
                booking.id(),
                booking.bookingCode(),
                booking.hotelId(),
                booking.customerId(),
                hotel.ownerId(),
                hotel.name(),
                booking.checkIn(),
                booking.checkOut(),
                hotel.checkInTime() == null ? LocalTime.of(14, 0) : hotel.checkInTime(),
                hotel.checkOutTime() == null ? LocalTime.NOON : hotel.checkOutTime()
        );

        conversationRepository.save(conversation);

        String welcome = "Xin chào! Đây là kênh hỗ trợ của " + conversation.getHotelName()
                + " cho booking " + safe(conversation.getBookingCode()) + ". "
                + "Bạn có thể hỏi về giờ nhận/trả phòng, địa chỉ, phòng đã đặt, thanh toán và quy định lưu trú. "
                + "Nếu yêu cầu cần khách sạn quyết định, mình sẽ chuyển cho nhân viên.";

        saveMessage(
                conversation,
                ChatSenderType.HOTEL_BOT,
                null,
                ChatMessageType.SYSTEM,
                welcome,
                "{\"event\":\"CONVERSATION_OPENED\"}"
        );

        reminderPlanService.ensurePlan(conversation);
        return conversation;
    }

    private void createHotelBotReply(
            ChatConversation conversation,
            String customerMessage,
            String bearerToken
    ) {
        BookingClient.BookingSnapshot booking = conversation.getBookingId() == null
                ? null
                : bookingClient.getBooking(conversation.getBookingId());

        HotelClient.HotelSnapshot hotel = hotelClient.getHotel(conversation.getHotelId());
        List<HotelClient.RoomTypeSnapshot> roomTypes = hotelClient.getRoomTypes(conversation.getHotelId());

        AiClient.AiReply reply = aiClient.reply(
                bearerToken,
                customerMessage,
                conversation,
                booking,
                hotel,
                roomTypes
        );

        if (reply == null) {
            reply = safeFallbackReply(customerMessage, booking, hotel, roomTypes);
        }

        saveMessage(
                conversation,
                ChatSenderType.HOTEL_BOT,
                null,
                ChatMessageType.TEXT,
                reply.answer(),
                reply.escalate() ? "{\"escalated\":true}" : "{\"autoReply\":true}"
        );

        if (reply.escalate()) {
            conversation.setHumanTakeover(true);
            conversationRepository.save(conversation);

            notificationClient.sendUser(
                    conversation.getHotelAdminId(),
                    "Khách cần nhân viên hỗ trợ",
                    conversation.getBookingId() == null
                            ? conversation.getHotelName() + " có khách cần hỗ trợ trong hộp chat."
                            : "Booking " + safe(conversation.getBookingCode())
                            + " có yêu cầu cần Hotel Admin xử lý.",
                    "CHAT_MESSAGE",
                    "CHAT",
                    "/hotel-admin/messages"
            );
        }
    }

    private AiClient.AiReply safeFallbackReply(
            String customerMessage,
            BookingClient.BookingSnapshot booking,
            HotelClient.HotelSnapshot hotel,
            List<HotelClient.RoomTypeSnapshot> roomTypes
    ) {
        String q = customerMessage == null ? "" : customerMessage.toLowerCase(Locale.ROOT);

        if (q.contains("nhận phòng") || q.contains("check in") || q.contains("check-in")) {
            if (booking != null) {
                return new AiClient.AiReply(
                        "Bạn nhận phòng từ " + hotel.checkInTime()
                                + " ngày " + booking.checkIn()
                                + " tại " + hotel.name() + ".",
                        false
                );
            }
            return new AiClient.AiReply(
                    hotel.name() + " nhận phòng từ " + hotel.checkInTime() + ".",
                    false
            );
        }

        if (q.contains("trả phòng") || q.contains("check out") || q.contains("check-out")) {
            if (booking != null) {
                return new AiClient.AiReply(
                        "Giờ trả phòng của " + hotel.name() + " là trước "
                                + hotel.checkOutTime() + " ngày " + booking.checkOut() + ".",
                        false
                );
            }
            return new AiClient.AiReply(
                    hotel.name() + " trả phòng trước " + hotel.checkOutTime() + ".",
                    false
            );
        }

        if (q.contains("địa chỉ") || q.contains("ở đâu")) {
            return new AiClient.AiReply(
                    hotel.name() + " ở " + safe(hotel.address()) + ", " + safe(hotel.city()) + ".",
                    false
            );
        }

        if ((q.contains("đã trả") || q.contains("còn lại") || q.contains("thanh toán")) && booking != null) {
            return new AiClient.AiReply(
                    "Booking " + safe(booking.bookingCode())
                            + " đã trả " + booking.paidAmount()
                            + " ₫, còn lại " + booking.remainingAmount() + " ₫.",
                    false
            );
        }

        if (q.contains("loại phòng") || q.contains("phòng nào") || q.contains("giá phòng")) {
            if (roomTypes != null && !roomTypes.isEmpty()) {
                String summary = roomTypes.stream()
                        .limit(6)
                        .map(item -> item.name() + " - " + item.basePrice() + " ₫/đêm")
                        .toList()
                        .toString();
                return new AiClient.AiReply(
                        "Các loại phòng hiện có: " + summary + ". Giá theo ngày có thể thay đổi; bạn chọn ngày để kiểm tra chính xác.",
                        false
                );
            }
        }

        if ((q.contains("còn phòng") || q.contains("phòng trống")) && booking == null) {
            return new AiClient.AiReply(
                    "Bạn cho mình ngày nhận và trả phòng để kiểm tra tình trạng phòng trống chính xác nhé.",
                    false
            );
        }

        return new AiClient.AiReply(
                "Yêu cầu này cần khách sạn xác nhận. Mình đã chuyển để nhân viên hỗ trợ bạn.",
                true
        );
    }

    private ChatMessage saveMessage(
            ChatConversation conversation,
            ChatSenderType senderType,
            UUID senderId,
            ChatMessageType messageType,
            String content,
            String metadataJson
    ) {
        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException("Tin nhắn không được để trống");
        }

        ChatMessage message = messageRepository.save(
                new ChatMessage(
                        conversation.getId(),
                        senderType,
                        senderId,
                        messageType,
                        content,
                        metadataJson
                )
        );

        conversation.touch(message.getCreatedAt());
        conversationRepository.save(conversation);

        ChatMessageResponse response = ChatMessageResponse.from(message);
        realtimePublisher.messageCreated(
                response,
                conversation.getCustomerId(),
                conversation.getHotelAdminId()
        );

        return message;
    }

    private List<ChatMessageResponse> getMessages(ChatConversation conversation) {
        return messageRepository
                .findAllByConversationIdOrderByCreatedAtAsc(conversation.getId())
                .stream()
                .map(ChatMessageResponse::from)
                .toList();
    }

    private int markRead(ChatConversation conversation, ChatSenderType viewerType) {
        List<ChatMessage> unread = messageRepository
                .findAllByConversationIdAndReadAtIsNullAndSenderTypeInOrderByCreatedAtAsc(
                        conversation.getId(),
                        unreadSenderTypes(viewerType)
                );

        unread.forEach(ChatMessage::markRead);
        messageRepository.saveAll(unread);
        return unread.size();
    }

    private ConversationResponse toResponse(
            ChatConversation conversation,
            ChatSenderType viewerType
    ) {
        long unreadCount = messageRepository
                .countByConversationIdAndReadAtIsNullAndSenderTypeIn(
                        conversation.getId(),
                        unreadSenderTypes(viewerType)
                );

        String lastMessage = messageRepository
                .findTopByConversationIdOrderByCreatedAtDesc(conversation.getId())
                .map(ChatMessage::getContent)
                .orElse("");

        return ConversationResponse.from(conversation, unreadCount, lastMessage);
    }


    private List<ChatSenderType> unreadSenderTypes(ChatSenderType viewerType) {
        if (viewerType == ChatSenderType.HOTEL_ADMIN) {
            return List.of(ChatSenderType.CUSTOMER);
        }
        return List.of(
                ChatSenderType.HOTEL_ADMIN,
                ChatSenderType.HOTEL_BOT,
                ChatSenderType.SYSTEM
        );
    }

    private ChatConversation requireCustomerConversation(
            UUID customerId,
            UUID conversationId
    ) {
        ChatConversation conversation = findConversation(conversationId);
        if (!customerId.equals(conversation.getCustomerId())) {
            throw new IllegalArgumentException("Bạn không có quyền xem cuộc trò chuyện này");
        }
        return conversation;
    }

    private ChatConversation requireHotelAdminConversation(
            UUID hotelAdminId,
            UUID conversationId
    ) {
        ChatConversation conversation = findConversation(conversationId);
        if (!hotelAdminId.equals(conversation.getHotelAdminId())) {
            throw new IllegalArgumentException("Cuộc trò chuyện không thuộc khách sạn của bạn");
        }
        return conversation;
    }

    private void requireBookingLinked(ChatConversation conversation) {
        if (conversation.getBookingId() == null) {
            throw new IllegalStateException("Thao tác này chỉ áp dụng cho hội thoại đã gắn với booking");
        }
    }

    private void requireOpen(ChatConversation conversation) {
        if (conversation.getStatus() != ConversationStatus.OPEN) {
            throw new IllegalStateException("Cuộc trò chuyện đã đóng");
        }
    }

    private String preview(String content) {
        String text = content == null ? "" : content.trim();
        return text.length() <= 120 ? text : text.substring(0, 117) + "...";
    }

    private String safe(String value) {
        return value == null || value.isBlank() ? "-" : value.trim();
    }
}
