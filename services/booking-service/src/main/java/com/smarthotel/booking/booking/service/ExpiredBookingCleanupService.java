package com.smarthotel.booking.booking.service;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.booking.realtime.AvailabilityEvent;
import com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.integration.notification.NotificationClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ExpiredBookingCleanupService {

    private final BookingRepository bookingRepository;
    private final RoomHoldService roomHoldService;
    private final AvailabilityRealtimeService realtimeService;
    private final NotificationClient notificationClient;

    public ExpiredBookingCleanupService(
            BookingRepository bookingRepository,
            RoomHoldService roomHoldService,
            AvailabilityRealtimeService realtimeService,
            NotificationClient notificationClient
    ) {
        this.bookingRepository = bookingRepository;
        this.roomHoldService = roomHoldService;
        this.realtimeService = realtimeService;
        this.notificationClient = notificationClient;
    }

    @Scheduled(fixedDelayString = "${booking.hold.cleanup-delay-ms:5000}")
    @Transactional
    public void cancelExpiredPendingPayments() {
        Instant now = Instant.now();
        List<Booking> expired = bookingRepository.findExpiredPendingPayments(now);
        if (expired.isEmpty()) return;

        Map<UUID, List<Booking>> byGroup = expired.stream()
                .collect(Collectors.groupingBy(booking -> booking.getBookingGroupId() != null
                        ? booking.getBookingGroupId()
                        : booking.getId()));

        for (var entry : byGroup.entrySet()) {
            List<Booking> group = entry.getValue();
            group.forEach(Booking::cancel);
            Booking first = group.get(0);

            roomHoldService.releaseByBookingGroup(first.getBookingGroupId());
            realtimeService.publish(AvailabilityEvent.of(
                    "RELEASED",
                    first.getHotelId(),
                    group.stream().map(Booking::getRoomId).toList(),
                    first.getCheckIn(),
                    first.getCheckOut(),
                    null
            ));

            try {
                notificationClient.sendUser(
                        first.getCustomerId(),
                        "Thời gian giữ phòng đã hết",
                        "Booking " + first.getBookingCode()
                                + " đã tự hủy vì chưa hoàn tất thanh toán trong thời gian giữ phòng.",
                        "BOOKING_EXPIRED",
                        "BOOKING",
                        "/customer/bookings"
                );
            } catch (Exception ignored) {
                // Cleanup booking không được thất bại chỉ vì notification tạm thời lỗi.
            }
        }
    }
}
