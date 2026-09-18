package com.smarthotel.chat.reminder.service;

import com.smarthotel.chat.conversation.entity.ChatConversation;
import com.smarthotel.chat.integration.booking.BookingClient;
import com.smarthotel.chat.reminder.entity.ReminderType;
import com.smarthotel.chat.reminder.entity.ScheduledReminder;
import com.smarthotel.chat.reminder.repository.ScheduledReminderRepository;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.UUID;

@Service
public class ReminderPlanService {

    private static final ZoneId HOTEL_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final ScheduledReminderRepository reminderRepository;

    public ReminderPlanService(ScheduledReminderRepository reminderRepository) {
        this.reminderRepository = reminderRepository;
    }

    public void ensurePlan(
            ChatConversation conversation,
            BookingClient.BookingSnapshot booking,
            LocalTime checkInTime,
            LocalTime checkOutTime
    ) {
        ZonedDateTime checkInAt = ZonedDateTime.of(
                booking.checkIn(),
                checkInTime,
                HOTEL_ZONE
        );
        ZonedDateTime checkOutAt = ZonedDateTime.of(
                booking.checkOut(),
                checkOutTime,
                HOTEL_ZONE
        );

        createIfMissing(
                conversation,
                booking.id(),
                ReminderType.CHECKIN_24H,
                checkInAt.minusHours(24).toInstant()
        );
        createIfMissing(
                conversation,
                booking.id(),
                ReminderType.CHECKIN_2H,
                checkInAt.minusHours(2).toInstant()
        );
        createIfMissing(
                conversation,
                booking.id(),
                ReminderType.CHECKIN_OVERDUE,
                checkInAt.plusHours(1).toInstant()
        );

        ZonedDateTime previousEvening = ZonedDateTime.of(
                booking.checkOut().minusDays(1),
                LocalTime.of(19, 0),
                HOTEL_ZONE
        );
        createIfMissing(
                conversation,
                booking.id(),
                ReminderType.CHECKOUT_PREVIOUS_EVENING,
                previousEvening.toInstant()
        );
        createIfMissing(
                conversation,
                booking.id(),
                ReminderType.CHECKOUT_2H,
                checkOutAt.minusHours(2).toInstant()
        );
        createIfMissing(
                conversation,
                booking.id(),
                ReminderType.CHECKOUT_OVERDUE,
                checkOutAt.plusMinutes(15).toInstant()
        );
    }

    private void createIfMissing(
            ChatConversation conversation,
            UUID bookingId,
            ReminderType type,
            Instant scheduledAt
    ) {
        String dedupeKey = bookingId + ":" + type.name();
        if (reminderRepository.findByDedupeKey(dedupeKey).isPresent()) {
            return;
        }

        boolean overdueReminder = type == ReminderType.CHECKIN_OVERDUE
                || type == ReminderType.CHECKOUT_OVERDUE;

        /*
         * Không gửi các lời nhắc "còn 24h / còn 2h / tối hôm trước"
         * nếu Chat Service được khởi động sau thời điểm đó.
         * Riêng overdue vẫn phải tạo để phát hiện khách chưa đến / trả trễ.
         */
        if (!overdueReminder && scheduledAt.isBefore(Instant.now())) {
            return;
        }

        reminderRepository.save(
                new ScheduledReminder(
                        conversation.getId(),
                        bookingId,
                        type,
                        scheduledAt,
                        dedupeKey
                )
        );
    }
}
