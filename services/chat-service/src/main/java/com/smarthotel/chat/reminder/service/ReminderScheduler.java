package com.smarthotel.chat.reminder.service;

import com.smarthotel.chat.conversation.entity.ArrivalStatus;
import com.smarthotel.chat.conversation.entity.ChatConversation;
import com.smarthotel.chat.conversation.service.ChatService;
import com.smarthotel.chat.integration.booking.BookingClient;
import com.smarthotel.chat.integration.notification.NotificationClient;
import com.smarthotel.chat.message.entity.ChatMessageType;
import com.smarthotel.chat.reminder.entity.ReminderStatus;
import com.smarthotel.chat.reminder.entity.ReminderType;
import com.smarthotel.chat.reminder.entity.ScheduledReminder;
import com.smarthotel.chat.reminder.repository.ScheduledReminderRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.*;
import java.util.List;
import java.util.Locale;

@Component
public class ReminderScheduler {

    private static final ZoneId HOTEL_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final ScheduledReminderRepository reminderRepository;
    private final BookingClient bookingClient;
    private final ChatService chatService;
    private final NotificationClient notificationClient;

    public ReminderScheduler(
            ScheduledReminderRepository reminderRepository,
            BookingClient bookingClient,
            ChatService chatService,
            NotificationClient notificationClient
    ) {
        this.reminderRepository = reminderRepository;
        this.bookingClient = bookingClient;
        this.chatService = chatService;
        this.notificationClient = notificationClient;
    }

    @Scheduled(fixedDelayString = "${chat.reminders.dispatch-delay-ms:30000}")
    public void dispatchDueReminders() {
        Instant now = Instant.now();

        List<ScheduledReminder> due = reminderRepository
                .findTop100ByStatusAndScheduledAtLessThanEqualOrderByScheduledAtAsc(
                        ReminderStatus.PENDING,
                        now
                );

        for (ScheduledReminder reminder : due) {
            try {
                dispatch(reminder, now);
            } catch (RuntimeException ignored) {
                // Retry ở vòng scheduler sau. Không làm một booking chặn toàn bộ reminder.
            }
        }
    }

    private void dispatch(ScheduledReminder reminder, Instant now) {
        BookingClient.BookingSnapshot booking = bookingClient.getBooking(reminder.getBookingId());
        String status = safe(booking.status()).toUpperCase(Locale.ROOT);
        ChatConversation conversation = chatService.findConversation(reminder.getConversationId());

        if ("CANCELLED".equals(status) || "CHECKED_OUT".equals(status)) {
            reminder.cancel();
            reminderRepository.save(reminder);
            return;
        }

        switch (reminder.getType()) {
            case CHECKIN_24H -> {
                if (!"CONFIRMED".equals(status)) {
                    reminder.cancel();
                    reminderRepository.save(reminder);
                    return;
                }
                send(
                        reminder,
                        conversation,
                        booking,
                        "Đơn " + safe(booking.bookingCode()) + ": Ngày mai bạn nhận phòng tại " + conversation.getHotelName()
                                + " từ " + conversation.getCheckInTime()
                                + ". Hãy xác nhận bạn sẽ đến; nếu đến trễ, bạn có thể báo giờ dự kiến ngay trong chat.",
                        "Sắp đến ngày nhận phòng",
                        "CHECKIN_REMINDER",
                        false
                );
            }

            case CHECKIN_2H -> {
                if (!"CONFIRMED".equals(status)) {
                    reminder.cancel();
                    reminderRepository.save(reminder);
                    return;
                }
                send(
                        reminder,
                        conversation,
                        booking,
                        "Đơn " + safe(booking.bookingCode()) + ": Còn khoảng 2 giờ tới giờ nhận phòng tại " + conversation.getHotelName()
                                + ". Nếu kế hoạch thay đổi, hãy báo khách sạn trong chat.",
                        "Nhắc nhận phòng",
                        "CHECKIN_REMINDER",
                        false
                );
            }

            case CHECKIN_OVERDUE -> {
                if (!"CONFIRMED".equals(status)) {
                    reminder.cancel();
                    reminderRepository.save(reminder);
                    return;
                }

                boolean currentBookingContext = reminder.getBookingId().equals(conversation.getBookingId());
                if (currentBookingContext
                        && conversation.getArrivalStatus() == ArrivalStatus.ARRIVING_LATE
                        && conversation.getExpectedArrivalTime() != null) {
                    ZonedDateTime expected = ZonedDateTime.of(
                            booking.checkIn(),
                            conversation.getExpectedArrivalTime(),
                            HOTEL_ZONE
                    ).plusHours(1);

                    if (expected.toInstant().isAfter(now)) {
                        reminder.reschedule(expected.toInstant());
                        reminderRepository.save(reminder);
                        return;
                    }
                }

                if (currentBookingContext) {
                    conversation.markNoShowRisk();
                }
                send(
                        reminder,
                        conversation,
                        booking,
                        "Đơn " + safe(booking.bookingCode()) + ": Đã qua giờ nhận phòng nhưng bạn vẫn chưa check-in. "
                                + "Bạn vẫn dự kiến đến hôm nay chứ? "
                                + "Hãy xác nhận hoặc báo giờ đến trễ để khách sạn giữ kế hoạch phục vụ.",
                        "Bạn chưa check-in",
                        "CHECKIN_OVERDUE",
                        true
                );
            }

            case CHECKOUT_PREVIOUS_EVENING -> {
                if (!"CHECKED_IN".equals(status)) {
                    reminder.cancel();
                    reminderRepository.save(reminder);
                    return;
                }
                send(
                        reminder,
                        conversation,
                        booking,
                        "Đơn " + safe(booking.bookingCode()) + ": Ngày mai bạn trả phòng trước " + conversation.getCheckOutTime()
                                + ". Nếu cần trả phòng muộn, hãy gửi yêu cầu để Hotel Admin xác nhận.",
                        "Nhắc lịch trả phòng",
                        "CHECKOUT_REMINDER",
                        false
                );
            }

            case CHECKOUT_2H -> {
                if (!"CHECKED_IN".equals(status)) {
                    reminder.cancel();
                    reminderRepository.save(reminder);
                    return;
                }
                send(
                        reminder,
                        conversation,
                        booking,
                        "Đơn " + safe(booking.bookingCode()) + ": Còn khoảng 2 giờ tới giờ trả phòng " + conversation.getCheckOutTime()
                                + ". Bạn nhớ hoàn tất checkout đúng giờ để tránh phụ thu trả trễ.",
                        "Sắp tới giờ trả phòng",
                        "CHECKOUT_REMINDER",
                        false
                );
            }

            case CHECKOUT_OVERDUE -> {
                if (!"CHECKED_IN".equals(status)) {
                    reminder.cancel();
                    reminderRepository.save(reminder);
                    return;
                }
                send(
                        reminder,
                        conversation,
                        booking,
                        "Đơn " + safe(booking.bookingCode()) + ": Đã qua giờ trả phòng. "
                                + "Nếu bạn vẫn cần sử dụng phòng, hãy liên hệ khách sạn ngay; "
                                + "phụ thu có thể phát sinh theo chính sách booking.",
                        "Đã quá giờ trả phòng",
                        "CHECKOUT_OVERDUE",
                        true
                );
            }
        }
    }

    private void send(
            ScheduledReminder reminder,
            ChatConversation conversation,
            BookingClient.BookingSnapshot booking,
            String content,
            String title,
            String notificationType,
            boolean alertHotelAdmin
    ) {
        chatService.addSystemMessage(
                conversation,
                content,
                ChatMessageType.REMINDER,
                "{\"reminderType\":\"" + reminder.getType().name() + "\"}"
        );

        notificationClient.sendUser(
                conversation.getCustomerId(),
                title,
                content,
                notificationType,
                "BOOKING_REMINDER",
                "/customer/bookings"
        );

        if (alertHotelAdmin) {
            notificationClient.sendUser(
                    conversation.getHotelAdminId(),
                    title,
                    "Booking " + safe(booking.bookingCode())
                            + " tại " + conversation.getHotelName() + ": " + content,
                    notificationType,
                    "BOOKING_REMINDER",
                    "/hotel-admin/messages"
            );
        }

        reminder.markSent();
        reminderRepository.save(reminder);
    }

    private String safe(String value) {
        return value == null ? "-" : value;
    }
}
