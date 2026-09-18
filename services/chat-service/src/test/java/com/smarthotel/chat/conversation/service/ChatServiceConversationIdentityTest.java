package com.smarthotel.chat.conversation.service;

import com.smarthotel.chat.conversation.entity.ChatConversation;
import com.smarthotel.chat.conversation.repository.ChatConversationRepository;
import com.smarthotel.chat.integration.ai.AiClient;
import com.smarthotel.chat.integration.booking.BookingClient;
import com.smarthotel.chat.integration.hotel.HotelClient;
import com.smarthotel.chat.integration.notification.NotificationClient;
import com.smarthotel.chat.message.entity.ChatMessage;
import com.smarthotel.chat.message.repository.ChatMessageRepository;
import com.smarthotel.chat.realtime.ChatRealtimePublisher;
import com.smarthotel.chat.reminder.service.ReminderPlanService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatServiceConversationIdentityTest {

    private final UUID customerA = UUID.randomUUID();
    private final UUID customerB = UUID.randomUUID();
    private final UUID hotelA = UUID.randomUUID();
    private final UUID hotelB = UUID.randomUUID();
    private final UUID adminA = UUID.randomUUID();
    private final UUID adminB = UUID.randomUUID();

    private final Map<String, ChatConversation> conversations = new HashMap<>();
    private final Map<UUID, BookingClient.BookingSnapshot> bookings = new HashMap<>();
    private ChatService chatService;

    @BeforeEach
    void setUp() {
        ChatConversationRepository conversationRepository = mock(ChatConversationRepository.class);
        ChatMessageRepository messageRepository = mock(ChatMessageRepository.class);
        BookingClient bookingClient = mock(BookingClient.class);
        HotelClient hotelClient = mock(HotelClient.class);
        NotificationClient notificationClient = mock(NotificationClient.class);
        AiClient aiClient = mock(AiClient.class);
        ChatRealtimePublisher realtimePublisher = mock(ChatRealtimePublisher.class);
        ReminderPlanService reminderPlanService = mock(ReminderPlanService.class);

        when(conversationRepository.findByCustomerIdAndHotelId(any(), any()))
                .thenAnswer(invocation -> Optional.ofNullable(conversations.get(key(
                        invocation.getArgument(0),
                        invocation.getArgument(1)
                ))));
        when(conversationRepository.save(any(ChatConversation.class))).thenAnswer(invocation -> {
            ChatConversation conversation = invocation.getArgument(0);
            conversations.put(key(conversation.getCustomerId(), conversation.getHotelId()), conversation);
            return conversation;
        });
        when(conversationRepository.findById(any())).thenAnswer(invocation -> conversations.values()
                .stream()
                .filter(item -> item.getId().equals(invocation.getArgument(0)))
                .findFirst());
        when(messageRepository.save(any(ChatMessage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(bookingClient.getBooking(any())).thenAnswer(invocation -> bookings.get(invocation.getArgument(0)));
        when(hotelClient.getHotel(hotelA)).thenReturn(hotel(hotelA, adminA, "Hotel A"));
        when(hotelClient.getHotel(hotelB)).thenReturn(hotel(hotelB, adminB, "Hotel B"));

        chatService = new ChatService(
                conversationRepository,
                messageRepository,
                bookingClient,
                hotelClient,
                notificationClient,
                aiClient,
                realtimePublisher,
                reminderPlanService
        );
    }

    @Test
    void sameCustomerAndHotelReuseExactlyOneConversationAcrossBookings() {
        BookingClient.BookingSnapshot first = booking(customerA, hotelA, "A-001", 10);
        BookingClient.BookingSnapshot second = booking(customerA, hotelA, "A-002", 20);
        BookingClient.BookingSnapshot third = booking(customerA, hotelA, "A-003", 30);
        register(first, second, third);

        UUID firstConversation = chatService.ensureCustomerConversation(customerA, first.id()).id();
        UUID secondConversation = chatService.ensureCustomerConversation(customerA, second.id()).id();
        UUID thirdConversation = chatService.ensureCustomerConversation(customerA, third.id()).id();

        assertEquals(firstConversation, secondConversation);
        assertEquals(firstConversation, thirdConversation);
        assertEquals(1, conversations.size());
        assertEquals(third.id(), conversations.get(key(customerA, hotelA)).getBookingId());
    }

    @Test
    void differentHotelOrCustomerKeepsSeparateConversationIdentity() {
        BookingClient.BookingSnapshot customerAHotelA = booking(customerA, hotelA, "AA-001", 10);
        BookingClient.BookingSnapshot customerAHotelB = booking(customerA, hotelB, "AB-001", 12);
        BookingClient.BookingSnapshot customerBHotelA = booking(customerB, hotelA, "BA-001", 14);
        register(customerAHotelA, customerAHotelB, customerBHotelA);

        UUID first = chatService.ensureCustomerConversation(customerA, customerAHotelA.id()).id();
        UUID second = chatService.ensureCustomerConversation(customerA, customerAHotelB.id()).id();
        UUID third = chatService.ensureCustomerConversation(customerB, customerBHotelA.id()).id();

        assertNotEquals(first, second);
        assertNotEquals(first, third);
        assertNotEquals(second, third);
        assertEquals(3, conversations.size());
    }

    @Test
    void customerAndHotelAdminCannotReadConversationOutsideTheirScope() {
        BookingClient.BookingSnapshot booking = booking(customerA, hotelA, "A-SEC", 10);
        register(booking);
        UUID conversationId = chatService.ensureCustomerConversation(customerA, booking.id()).id();

        assertThrows(
                IllegalArgumentException.class,
                () -> chatService.getCustomerMessages(customerB, conversationId)
        );
        assertThrows(
                IllegalArgumentException.class,
                () -> chatService.getHotelAdminMessages(adminB, conversationId)
        );
    }

    private void register(BookingClient.BookingSnapshot... snapshots) {
        for (BookingClient.BookingSnapshot snapshot : snapshots) bookings.put(snapshot.id(), snapshot);
    }

    private BookingClient.BookingSnapshot booking(
            UUID customerId,
            UUID hotelId,
            String code,
            int dayOffset
    ) {
        LocalDate checkIn = LocalDate.now().plusDays(dayOffset);
        return new BookingClient.BookingSnapshot(
                UUID.randomUUID(), UUID.randomUUID(), code, customerId, hotelId,
                UUID.randomUUID(), UUID.randomUUID(), checkIn, checkIn.plusDays(2),
                2, 2, 0, BigDecimal.valueOf(2_000_000), BigDecimal.valueOf(500_000),
                BigDecimal.valueOf(1_500_000), "DEPOSIT", "PAID", 25,
                "CONFIRMED", "Khách", "A", "guest@example.com", "0900000000",
                null, null, null
        );
    }

    private HotelClient.HotelSnapshot hotel(UUID id, UUID ownerId, String name) {
        return new HotelClient.HotelSnapshot(
                id, ownerId, name, null, "Địa chỉ", null, null, "Đà Nẵng",
                null, null, 5, LocalTime.of(14, 0), LocalTime.NOON, Set.of()
        );
    }

    private String key(UUID customerId, UUID hotelId) {
        return customerId + ":" + hotelId;
    }
}
