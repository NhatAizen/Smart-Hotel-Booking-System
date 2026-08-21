package com.smarthotel.chat.reminder.service;

import com.smarthotel.chat.conversation.service.ChatService;
import com.smarthotel.chat.integration.booking.BookingClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class BookingConversationSyncScheduler {

    private final BookingClient bookingClient;
    private final ChatService chatService;

    public BookingConversationSyncScheduler(
            BookingClient bookingClient,
            ChatService chatService
    ) {
        this.bookingClient = bookingClient;
        this.chatService = chatService;
    }

    @Scheduled(
            initialDelayString = "${chat.sync.initial-delay-ms:15000}",
            fixedDelayString = "${chat.sync.fixed-delay-ms:60000}"
    )
    public void ensureActiveBookingConversations() {
        Map<UUID, BookingClient.BookingSnapshot> bookings = new LinkedHashMap<>();

        bookingClient.getByStatus("CONFIRMED")
                .forEach(item -> bookings.put(item.id(), item));
        bookingClient.getByStatus("CHECKED_IN")
                .forEach(item -> bookings.put(item.id(), item));

        for (BookingClient.BookingSnapshot booking : bookings.values()) {
            try {
                chatService.ensureConversation(booking);
            } catch (RuntimeException ignored) {
                // Một booking dữ liệu lỗi không được dừng sync các booking khác.
            }
        }
    }
}
