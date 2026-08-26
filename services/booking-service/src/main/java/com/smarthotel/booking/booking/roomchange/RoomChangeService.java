package com.smarthotel.booking.booking.roomchange;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.booking.realtime.AvailabilityEvent;
import com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.pricing.entity.BookingNightPrice;
import com.smarthotel.booking.pricing.repository.BookingNightPriceRepository;
import com.smarthotel.booking.pricing.service.PricingService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

@Service
public class RoomChangeService {

    private static final ZoneId HOTEL_TIME_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final RoomChangeRequestRepository requestRepository;
    private final BookingRepository bookingRepository;
    private final HotelClient hotelClient;
    private final PricingService pricingService;
    private final BookingNightPriceRepository nightPriceRepository;
    private final RoomHoldService roomHoldService;
    private final AvailabilityRealtimeService realtimeService;
    private final NotificationClient notificationClient;

    public RoomChangeService(
            RoomChangeRequestRepository requestRepository,
            BookingRepository bookingRepository,
            HotelClient hotelClient,
            PricingService pricingService,
            BookingNightPriceRepository nightPriceRepository,
            RoomHoldService roomHoldService,
            AvailabilityRealtimeService realtimeService,
            NotificationClient notificationClient
    ) {
        this.requestRepository = requestRepository;
        this.bookingRepository = bookingRepository;
        this.hotelClient = hotelClient;
        this.pricingService = pricingService;
        this.nightPriceRepository = nightPriceRepository;
        this.roomHoldService = roomHoldService;
        this.realtimeService = realtimeService;
        this.notificationClient = notificationClient;
    }

    @Transactional
    public RoomChangeRequestResponse create(
            UUID customerId,
            UUID bookingId,
            CreateRoomChangeRequest request
    ) {
        Booking booking = findBooking(bookingId);
        if (!booking.getCustomerId().equals(customerId)) {
            throw new IllegalStateException("Bạn không có quyền yêu cầu đổi phòng cho booking này");
        }
        ensureChangeable(booking);
        if (requestRepository.existsByBookingIdAndStatus(
                bookingId,
                RoomChangeRequestStatus.PENDING
        )) {
            throw new IllegalStateException("Booking đang có một yêu cầu đổi phòng chờ khách sạn xử lý");
        }

        // Customer tự chọn chính xác phòng muốn đổi sang. Kiểm tra ngay lúc gửi
        // yêu cầu để không cho chọn phòng sai khách sạn, không đủ sức chứa hoặc
        // đã bị giữ/đặt trong khoảng lưu trú. Phòng KHÔNG bị khóa dài hạn ở bước
        // này; Hotel Admin sẽ kiểm tra lại một lần nữa khi phê duyệt.
        ChangePlan requestedPlan = buildPlan(booking, request.targetRoomId(), true);

        RoomChangeRequest created = requestRepository.save(new RoomChangeRequest(
                booking.getId(),
                booking.getCustomerId(),
                booking.getHotelId(),
                booking.getRoomId(),
                booking.getRoomTypeId(),
                requestedPlan.room().id(),
                requestedPlan.room().roomTypeId(),
                request.reason()
        ));

        HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.getHotelId());
        if (hotel.ownerId() != null) {
            afterCommit(() -> notificationClient.sendUser(
                    hotel.ownerId(),
                    "Khách yêu cầu đổi phòng",
                    "Booking " + booking.getBookingCode()
                            + " muốn đổi sang " + requestedPlan.roomType().name()
                            + " - phòng " + requestedPlan.room().roomNumber()
                            + ". Vui lòng kiểm tra và phản hồi.",
                    "ROOM_CHANGE_REQUESTED",
                    "BOOKING",
                    "/hotel-admin/bookings"
            ));
        }
        return RoomChangeRequestResponse.from(created);
    }

    @Transactional(readOnly = true)
    public List<RoomChangeRequestResponse> getMine(UUID customerId) {
        return requestRepository.findAllByCustomerIdOrderByRequestedAtDesc(customerId)
                .stream()
                .map(RoomChangeRequestResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RoomChangeRequestResponse> getHotelRequests(
            UUID hotelAdminId,
            UUID hotelId
    ) {
        requireHotelOwner(hotelAdminId, hotelId);
        return requestRepository.findAllByHotelIdOrderByRequestedAtDesc(hotelId)
                .stream()
                .map(RoomChangeRequestResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public RoomChangeQuoteResponse quote(
            UUID hotelAdminId,
            UUID requestId
    ) {
        RoomChangeRequest request = findRequest(requestId);
        requireHotelOwner(hotelAdminId, request.getHotelId());
        Booking booking = findBooking(request.getBookingId());
        ensurePending(request);
        UUID targetRoomId = requestedTargetRoomId(request);
        ChangePlan plan = buildPlan(booking, targetRoomId, true);
        return plan.toQuote(request.getId(), booking);
    }

    @Transactional
    public RoomChangeRequestResponse approve(
            UUID hotelAdminId,
            UUID requestId,
            ApproveRoomChangeRequest body
    ) {
        RoomChangeRequest request = findRequest(requestId);
        ensurePending(request);
        requireHotelOwner(hotelAdminId, request.getHotelId());
        Booking booking = findBooking(request.getBookingId());
        ensureChangeable(booking);

        UUID targetRoomId = requestedTargetRoomId(request);
        if (targetRoomId.equals(booking.getRoomId())) {
            throw new IllegalArgumentException("Phòng Customer yêu cầu phải khác phòng hiện tại");
        }

        RoomHoldService.Hold hold = roomHoldService.acquire(
                request.getId(),
                booking.getCustomerId(),
                booking.getHotelId(),
                List.of(targetRoomId),
                booking.getCheckIn(),
                booking.getCheckOut()
        );

        try {
            // Sau khi Redis đã khóa phòng thay thế, kiểm tra DB lại một lần nữa
            // để tránh race-condition với booking khác.
            if (bookingRepository.existsOverlappingBooking(
                    targetRoomId,
                    booking.getCheckIn(),
                    booking.getCheckOut(),
                    Instant.now()
            )) {
                throw new IllegalStateException("Phòng vừa được booking khác giữ/đặt. Vui lòng chọn phòng khác.");
            }

            ChangePlan plan = buildPlan(booking, targetRoomId, false);
            UUID oldRoomId = booking.getRoomId();
            BigDecimal oldTotal = booking.getTotalPrice();

            booking.applyRoomChange(
                    plan.room().roomTypeId(),
                    plan.room().id(),
                    plan.pricing().baseAmount(),
                    plan.pricing().weekendSurchargeAmount(),
                    plan.pricing().specialDateSurchargeAmount()
            );
            bookingRepository.save(booking);
            replaceNightlyPricing(booking.getId(), plan.pricing());

            BigDecimal newTotal = booking.getTotalPrice();
            BigDecimal additionalDue = calculateAdditionalPaymentDue(booking);
            request.approve(
                    hotelAdminId,
                    plan.room().id(),
                    plan.room().roomTypeId(),
                    oldTotal,
                    newTotal,
                    money(newTotal.subtract(oldTotal)),
                    additionalDue,
                    body.note()
            );
            requestRepository.save(request);

            registerHoldReleaseAfterCompletion(hold);
            afterCommit(() -> {
                realtimeService.publish(AvailabilityEvent.of(
                        "ROOM_CHANGED",
                        booking.getHotelId(),
                        List.of(oldRoomId, booking.getRoomId()),
                        booking.getCheckIn(),
                        booking.getCheckOut(),
                        null
                ));
                notificationClient.sendUser(
                        booking.getCustomerId(),
                        "Yêu cầu đổi phòng đã được duyệt",
                        additionalDue.signum() > 0
                                ? "Khách sạn đã đổi phòng cho booking " + booking.getBookingCode()
                                    + ". Bạn cần thanh toán bổ sung " + moneyText(additionalDue)
                                    + " để đủ mức thanh toán yêu cầu."
                                : "Khách sạn đã đổi phòng cho booking " + booking.getBookingCode()
                                    + ". Không phát sinh khoản thanh toán bổ sung ngay lúc này.",
                        "ROOM_CHANGE_APPROVED",
                        "BOOKING",
                        "/customer/bookings"
                );
            });

            return RoomChangeRequestResponse.from(request);
        } catch (RuntimeException exception) {
            roomHoldService.release(hold);
            throw exception;
        }
    }

    @Transactional
    public RoomChangeRequestResponse reject(
            UUID hotelAdminId,
            UUID requestId,
            RejectRoomChangeRequest body
    ) {
        RoomChangeRequest request = findRequest(requestId);
        ensurePending(request);
        requireHotelOwner(hotelAdminId, request.getHotelId());
        request.reject(hotelAdminId, body.note());
        requestRepository.save(request);

        Booking booking = findBooking(request.getBookingId());
        afterCommit(() -> notificationClient.sendUser(
                booking.getCustomerId(),
                "Yêu cầu đổi phòng chưa được chấp thuận",
                body.note() == null || body.note().isBlank()
                        ? "Khách sạn chưa thể đổi phòng cho booking " + booking.getBookingCode() + "."
                        : "Booking " + booking.getBookingCode() + ": " + body.note().trim(),
                "ROOM_CHANGE_REJECTED",
                "BOOKING",
                "/customer/bookings"
        ));
        return RoomChangeRequestResponse.from(request);
    }

    private ChangePlan buildPlan(
            Booking booking,
            UUID targetRoomId,
            boolean checkRedisHolds
    ) {
        ensureChangeable(booking);
        if (targetRoomId == null) {
            throw new IllegalArgumentException("Phải chọn phòng thay thế");
        }
        if (targetRoomId.equals(booking.getRoomId())) {
            throw new IllegalArgumentException("Phòng thay thế phải khác phòng hiện tại");
        }

        HotelClient.RoomDetails room = hotelClient.getRoom(targetRoomId);
        if (!booking.getHotelId().equals(room.hotelId())) {
            throw new IllegalArgumentException("Chỉ được đổi sang phòng thuộc cùng khách sạn");
        }

        String roomStatus = room.status() == null ? "" : room.status().trim().toUpperCase();
        if ("MAINTENANCE".equals(roomStatus) || "INACTIVE".equals(roomStatus)) {
            throw new IllegalArgumentException("Phòng thay thế hiện không được mở bán");
        }
        LocalDate today = LocalDate.now(HOTEL_TIME_ZONE);
        if (!booking.getCheckIn().isAfter(today) && !"AVAILABLE".equals(roomStatus)) {
            throw new IllegalArgumentException("Phòng thay thế chưa sẵn sàng để nhận khách hôm nay");
        }

        if (bookingRepository.existsOverlappingBooking(
                targetRoomId,
                booking.getCheckIn(),
                booking.getCheckOut(),
                Instant.now()
        )) {
            throw new IllegalStateException("Phòng thay thế không còn trống trong toàn bộ thời gian lưu trú");
        }

        if (checkRedisHolds) {
            boolean held = roomHoldService.findActiveHolds(
                            booking.getHotelId(),
                            booking.getCheckIn(),
                            booking.getCheckOut()
                    ).stream()
                    .anyMatch(item -> targetRoomId.equals(item.roomId()));
            if (held) {
                throw new IllegalStateException("Phòng thay thế đang được khách khác giữ tạm thời");
            }
        }

        HotelClient.RoomTypeDetails roomType = hotelClient.getRoomType(room.roomTypeId());
        if (!booking.getHotelId().equals(roomType.hotelId())) {
            throw new IllegalArgumentException("Loại phòng thay thế không thuộc khách sạn hiện tại");
        }
        if (booking.getAdults() > roomType.maxAdults()
                || booking.getChildren() > roomType.maxChildren()) {
            throw new IllegalArgumentException("Phòng thay thế không đủ sức chứa cho số khách của booking");
        }

        BigDecimal nightlyPrice = room.customPrice() != null
                ? room.customPrice()
                : roomType.basePrice();
        PricingService.RoomPricing pricing = pricingService.calculateRoomPricing(
                room.id(),
                room.roomTypeId(),
                room.roomNumber(),
                roomType.name(),
                nightlyPrice,
                booking.getCheckIn(),
                booking.getCheckOut()
        );

        BigDecimal totalDiscount = money(booking.getTotalDiscountAmount());
        if (totalDiscount.compareTo(pricing.totalAmount()) > 0) {
            throw new IllegalStateException(
                    "Ưu đãi của booking hiện tại vượt giá phòng thay thế. Vui lòng chọn phòng khác."
            );
        }
        BigDecimal lateFee = money(booking.getLateCheckoutFee());
        BigDecimal newTotal = money(pricing.totalAmount().subtract(totalDiscount).add(lateFee));
        BigDecimal paid = money(booking.getPaidAmount());
        if (paid.compareTo(newTotal) > 0) {
            throw new IllegalStateException(
                    "Phòng thay thế rẻ hơn số tiền khách đã thanh toán. "
                            + "Luồng đổi phòng hiện không tự hoàn phần chênh lệch; hãy chọn phòng khác hoặc xử lý hoàn tiền riêng."
            );
        }

        return new ChangePlan(room, roomType, pricing, newTotal, previewAdditionalPaymentDue(booking, newTotal));
    }

    private BigDecimal previewAdditionalPaymentDue(Booking booking, BigDecimal newTotal) {
        BigDecimal paid = money(booking.getPaidAmount());
        BigDecimal requiredPaid;
        if (booking.getPaymentOption() == PaymentOption.DEPOSIT) {
            int percent = booking.getDepositPercent() == null ? 0 : booking.getDepositPercent();
            requiredPaid = money(newTotal
                    .multiply(BigDecimal.valueOf(percent))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
        } else if (booking.getPaymentOption() == PaymentOption.FULL_PAYMENT) {
            requiredPaid = newTotal;
        } else {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return money(requiredPaid.subtract(paid).max(BigDecimal.ZERO));
    }

    private BigDecimal calculateAdditionalPaymentDue(Booking booking) {
        if (booking.getPaymentOption() == PaymentOption.PAY_AT_HOTEL) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return money(booking.getPaymentDueAmount().min(booking.getRemainingAmount()));
    }

    private void replaceNightlyPricing(UUID bookingId, PricingService.RoomPricing pricing) {
        List<BookingNightPrice> existing = nightPriceRepository
                .findAllByBookingIdOrderByStayDateAsc(bookingId);
        if (!existing.isEmpty()) {
            nightPriceRepository.deleteAllInBatch(existing);
        }
        List<BookingNightPrice> replacements = pricing.nights().stream()
                .map(night -> new BookingNightPrice(
                        bookingId,
                        night.stayDate(),
                        night.basePrice(),
                        night.pricingType(),
                        night.pricingLabel(),
                        night.surchargePercent(),
                        night.surchargeAmount(),
                        night.finalPrice()
                ))
                .toList();
        nightPriceRepository.saveAll(replacements);
    }

    private void ensureChangeable(Booking booking) {
        if (booking.getStatus() != BookingStatus.CONFIRMED) {
            throw new IllegalStateException("Chỉ booking đã xác nhận và chưa check-in mới được yêu cầu đổi phòng");
        }
        LocalDate today = LocalDate.now(HOTEL_TIME_ZONE);
        if (booking.getCheckIn().isBefore(today)) {
            throw new IllegalStateException("Booking đã qua ngày nhận phòng nên không thể đổi phòng");
        }
    }

    private void requireHotelOwner(UUID hotelAdminId, UUID hotelId) {
        HotelClient.HotelDetails hotel = hotelClient.getHotel(hotelId);
        if (hotel.ownerId() == null || !hotel.ownerId().equals(hotelAdminId)) {
            throw new IllegalStateException("Bạn không có quyền xử lý booking của khách sạn này");
        }
    }

    private UUID requestedTargetRoomId(RoomChangeRequest request) {
        if (request.getTargetRoomId() == null) {
            throw new IllegalStateException(
                    "Yêu cầu đổi phòng cũ chưa có phòng Customer lựa chọn. Vui lòng từ chối yêu cầu này và để Customer gửi lại."
            );
        }
        return request.getTargetRoomId();
    }

    private Booking findBooking(UUID bookingId) {
        return bookingRepository.findById(bookingId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy booking"));
    }

    private RoomChangeRequest findRequest(UUID requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy yêu cầu đổi phòng"));
    }

    private void ensurePending(RoomChangeRequest request) {
        if (request.getStatus() != RoomChangeRequestStatus.PENDING) {
            throw new IllegalStateException("Yêu cầu đổi phòng đã được xử lý");
        }
    }

    private void registerHoldReleaseAfterCompletion(RoomHoldService.Hold hold) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            roomHoldService.release(hold);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                roomHoldService.release(hold);
            }
        });
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }

    private static BigDecimal money(BigDecimal value) {
        if (value == null) return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static String moneyText(BigDecimal value) {
        return money(value).stripTrailingZeros().toPlainString() + " đ";
    }

    private record ChangePlan(
            HotelClient.RoomDetails room,
            HotelClient.RoomTypeDetails roomType,
            PricingService.RoomPricing pricing,
            BigDecimal newTotal,
            BigDecimal additionalPaymentDue
    ) {
        RoomChangeQuoteResponse toQuote(UUID requestId, Booking booking) {
            BigDecimal oldTotal = money(booking.getTotalPrice());
            return new RoomChangeQuoteResponse(
                    requestId,
                    booking.getId(),
                    room.id(),
                    room.roomTypeId(),
                    room.roomNumber(),
                    roomType.name(),
                    oldTotal,
                    newTotal,
                    money(newTotal.subtract(oldTotal)),
                    additionalPaymentDue,
                    booking.getPaymentOption().name(),
                    booking.getDepositPercent()
            );
        }
    }
}
