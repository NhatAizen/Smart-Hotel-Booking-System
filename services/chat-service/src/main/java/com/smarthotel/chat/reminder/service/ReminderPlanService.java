package com.smarthotel.chat.reminder.service;

import com.smarthotel.chat.conversation.entity.ChatConversation;
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

    public void ensurePlan(ChatConversation conversation) {
        ZonedDateTime checkInAt = ZonedDateTime.of(
                conversation.getCheckIn(),
                conversation.getCheckInTime(),
                HOTEL_ZONE
        );
        ZonedDateTime checkOutAt = ZonedDateTime.of(
                conversation.getCheckOut(),
                conversation.getCheckOutTime(),
                HOTEL_ZONE
        );

        createIfMissing(
                conversation,
                ReminderType.CHECKIN_24H,
                checkInAt.minusHours(24).toInstant()
        );
        createIfMissing(
                conversation,
                ReminderType.CHECKIN_2H,
                checkInAt.minusHours(2).toInstant()
        );
        createIfMissing(
                conversation,
                ReminderType.CHECKIN_OVERDUE,
                checkInAt.plusHours(1).toInstant()
        );

        ZonedDateTime previousEvening = ZonedDateTime.of(
                conversation.getCheckOut().minusDays(1),
                LocalTime.of(19, 0),
                HOTEL_ZONE
        );
        createIfMissing(
                conversation,
                ReminderType.CHECKOUT_PREVIOUS_EVENING,
                previousEvening.toInstant()
        );
        createIfMissing(
                conversation,
                ReminderType.CHECKOUT_2H,
                checkOutAt.minusHours(2).toInstant()
        );
        createIfMissing(
                conversation,
                ReminderType.CHECKOUT_OVERDUE,
                checkOutAt.plusMinutes(15).toInstant()
        );
    }

    private void createIfMissing(
            ChatConversation conversation,
            ReminderType type,
            Instant scheduledAt
    ) {
        String dedupeKey = conversation.getBookingId() + ":" + type.name();
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
                        conversation.getBookingId(),
                        type,
                        scheduledAt,
                        dedupeKey
                )
        );
    }
}
