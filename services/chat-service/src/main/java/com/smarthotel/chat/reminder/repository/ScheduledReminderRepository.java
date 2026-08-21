package com.smarthotel.chat.reminder.repository;

import com.smarthotel.chat.reminder.entity.ReminderStatus;
import com.smarthotel.chat.reminder.entity.ScheduledReminder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ScheduledReminderRepository extends JpaRepository<ScheduledReminder, UUID> {

    Optional<ScheduledReminder> findByDedupeKey(String dedupeKey);

    List<ScheduledReminder> findTop100ByStatusAndScheduledAtLessThanEqualOrderByScheduledAtAsc(
            ReminderStatus status,
            Instant now
    );

    List<ScheduledReminder> findAllByConversationIdAndStatus(UUID conversationId, ReminderStatus status);
}
