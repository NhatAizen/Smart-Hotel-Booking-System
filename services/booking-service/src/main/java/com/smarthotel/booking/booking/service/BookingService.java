package com.smarthotel.booking.booking.service;

import com.smarthotel.booking.booking.dto.ApplyPaymentRequest;
import com.smarthotel.booking.booking.dto.AvailabilityResponse;
import com.smarthotel.booking.booking.dto.BookingResponse;
import com.smarthotel.booking.booking.dto.BookingHoldResponse;
import com.smarthotel.booking.booking.dto.CreateRoomHoldRequest;
import com.smarthotel.booking.booking.dto.CheckInDetailsResponse;
import com.smarthotel.booking.booking.dto.CreateBookingBatchRequest;
import com.smarthotel.booking.booking.dto.CreateBookingRequest;
import com.smarthotel.booking.booking.dto.RoomHoldResponse;
import com.smarthotel.booking.booking.dto.RoleChangeBookingEligibilityRequest;
import com.smarthotel.booking.booking.dto.RoleChangeBookingEligibilityResponse;
import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingPaymentStatus;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.booking.realtime.AvailabilityEvent;
import com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService;
import com.smarthotel.booking.common.exception.BookingNotFoundException;
import com.smarthotel.booking.common.exception.RoomAlreadyBookedException;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.pricing.dto.LateCheckoutDetailsResponse;
import com.smarthotel.booking.pricing.service.PricingService;
import com.smarthotel.booking.rolechange.fence.OwnerDemotionFenceService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class BookingService {

    private static final ZoneId HOTEL_TIME_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final BookingRepository bookingRepository;
    private final HotelClient hotelClient;
    private final NotificationClient notificationClient;
    private final RoomHoldService roomHoldService;
    private final AvailabilityRealtimeService realtimeService;
    private final PricingService pricingService;
    private final OwnerDemotionFenceService ownerDemotionFenceService;

    public BookingService(
            BookingRepository bookingRepository,
            HotelClient hotelClient,
            NotificationClient notificationClient,
            RoomHoldService roomHoldService,
            AvailabilityRealtimeService realtimeService,
            PricingService pricingService,
            OwnerDemotionFenceService ownerDemotionFenceService
    ) {
        this.bookingRepository = bookingRepository;
        this.hotelClient = hotelClient;
        this.notificationClient = notificationClient;
        this.roomHoldService = roomHoldService;
        this.realtimeService = realtimeService;
        this.pricingService = pricingService;
        this.ownerDemotionFenceService = ownerDemotionFenceService;
    }

    @Transactional
    public BookingResponse create(CreateBookingRequest request) {
        return createBatch(request.toBatch()).get(0);
    }

    @Transactional
    public List<BookingResponse> createBatch(CreateBookingBatchRequest request) {
        validateDateRange(request.checkIn(), request.checkOut());
        validateGuestAndInvoiceInformation(request);

        HotelClient.HotelDetails targetHotel = hotelClient.getHotel(request.hotelId());
        if (targetHotel.ownerId() == null) {
            throw new IllegalStateException("Khách sạn chưa có chủ sở hữu");
        }
        ownerDemotionFenceService.assertLiabilityCreationAllowed(targetHotel.ownerId());

        List<UUID> distinctRoomIds = request.roomIds().stream().distinct().toList();
        if (distinctRoomIds.size() != request.roomIds().size()) {
            throw new IllegalArgumentException("Danh sách phòng có dữ liệu trùng lặp");
        }

        Instant now = Instant.now();
        UUID bookingGroupId = request.holdToken() != null
                ? request.holdToken()
                : UUID.randomUUID();
        List<ResolvedRoom> resolvedRooms = new ArrayList<>();

        // Kiểm tra DB trước để trả lỗi sớm, sau đó Redis sẽ khóa nguyên tử trước khi save.
        for (UUID roomId : distinctRoomIds) {
            if (bookingRepository.existsOverlappingBooking(
                    roomId, request.checkIn(), request.checkOut(), now
            )) {
                throw new RoomAlreadyBookedException();
            }

            HotelClient.RoomDetails room = hotelClient.getRoom(roomId);
            if (!request.hotelId().equals(room.hotelId())) {
                throw new IllegalArgumentException("Phòng không thuộc khách sạn đã chọn");
            }
            String roomStatus = room.status() == null ? "" : room.status().toUpperCase();
            LocalDate today = LocalDate.now(HOTEL_TIME_ZONE);
            boolean checkInTodayOrEarlier = !request.checkIn().isAfter(today);

            if (checkInTodayOrEarlier && !"AVAILABLE".equals(roomStatus)) {
                throw new IllegalArgumentException(
                        "Phòng " + room.roomNumber()
                                + " chưa sẵn sàng để nhận khách hôm nay"
                );
            }

            if ("MAINTENANCE".equals(roomStatus) || "INACTIVE".equals(roomStatus)) {
                throw new IllegalArgumentException(
                        "Phòng " + room.roomNumber() + " hiện không được mở bán"
                );
            }

            HotelClient.RoomTypeDetails roomType = hotelClient.getRoomType(room.roomTypeId());
            if (!request.hotelId().equals(roomType.hotelId())) {
                throw new IllegalArgumentException("Loại phòng không thuộc khách sạn đã chọn");
            }
            validatePaymentOption(request.paymentOption(), roomType);

            BigDecimal nightlyPrice = room.customPrice() != null
                    ? room.customPrice()
                    : roomType.basePrice();
            PricingService.RoomPricing pricing = pricingService.calculateRoomPricing(
                    room.id(),
                    room.roomTypeId(),
                    room.roomNumber(),
                    roomType.name(),
                    nightlyPrice,
                    request.checkIn(),
                    request.checkOut()
            );
            resolvedRooms.add(new ResolvedRoom(room, roomType, pricing));
        }

        int totalAdultCapacity = resolvedRooms.stream()
                .mapToInt(item -> item.roomType().maxAdults())
                .sum();
        int totalChildCapacity = resolvedRooms.stream()
                .mapToInt(item -> item.roomType().maxChildren())
                .sum();
        if (request.adults() > totalAdultCapacity || request.children() > totalChildCapacity) {
            throw new IllegalArgumentException(
                    "Số khách vượt quá sức chứa của các phòng đã chọn"
            );
        }

        RoomHoldService.Hold roomHold = request.holdToken() != null
                ? roomHoldService.reuseExisting(
                        request.holdToken(),
                        request.customerId(),
                        request.hotelId(),
                        distinctRoomIds,
                        request.checkIn(),
                        request.checkOut()
                )
                : roomHoldService.acquire(
                        bookingGroupId,
                        request.customerId(),
                        request.hotelId(),
                        distinctRoomIds,
                        request.checkIn(),
                        request.checkOut()
                );

        try {
            // Re-check sau khi đã lấy Redis lock để khép kín race condition
            // giữa lần kiểm tra ban đầu và thời điểm ghi booking.
            Instant lockedAt = Instant.now();
            for (UUID roomId : distinctRoomIds) {
                if (bookingRepository.existsOverlappingBooking(
                        roomId, request.checkIn(), request.checkOut(), lockedAt
                )) {
                    throw new RoomAlreadyBookedException();
                }
            }

            Instant paymentExpiresAt = request.paymentOption() == PaymentOption.PAY_AT_HOTEL
                    ? null
                    : roomHold.expiresAt();

            List<Booking> bookings = resolvedRooms.stream()
                    .map(item -> {
                        Booking booking = new Booking(
                                bookingGroupId,
                                request.customerId(),
                                request.hotelId(),
                                item.room().roomTypeId(),
                                item.room().id(),
                                request.checkIn(),
                                request.checkOut(),
                                request.adults(),
                                request.children(),
                                item.pricing().totalAmount(),
                                request.paymentOption(),
                                item.roomType().depositPercent(),
                                paymentExpiresAt,
                                request.bookerFirstName(),
                                request.bookerLastName(),
                                request.bookerEmail(),
                                request.bookerPhone(),
                                request.bookerIsGuest(),
                                request.guestFirstName(),
                                request.guestLastName(),
                                request.guestPhone(),
                                request.specialRequest(),
                                request.invoiceRequested(),
                                request.invoiceCompanyName(),
                                request.invoiceTaxCode(),
                                request.invoiceAddress(),
                                request.invoiceEmail(),
                                request.termsAccepted()
                        );
                        booking.applyPricingBreakdown(
                                item.pricing().baseAmount(),
                                item.pricing().weekendSurchargeAmount(),
                                item.pricing().specialDateSurchargeAmount()
                        );
                        return booking;
                    })
                    .toList();

            List<Booking> savedBookings = bookingRepository.saveAll(bookings);
            for (int index = 0; index < savedBookings.size(); index++) {
                pricingService.saveNightlySnapshot(
                        savedBookings.get(index).getId(),
                        resolvedRooms.get(index).pricing()
                );
            }
            if (!savedBookings.isEmpty()) {
                Booking first = savedBookings.get(0);
                HotelClient.HotelDetails hotel = targetHotel;
                notificationClient.sendUser(
                        first.getCustomerId(),
                        "Đã tạo booking",
                        "Booking tại " + hotel.name() + " đã được tạo. Hãy hoàn tất thanh toán theo phương thức đã chọn.",
                        "BOOKING_CREATED",
                        "BOOKING",
                        "/customer/bookings"
                );
                if (hotel.ownerId() != null) {
                    notificationClient.sendUser(
                            hotel.ownerId(),
                            "Có booking mới",
                            "Khách vừa tạo booking tại " + hotel.name() + ". Vui lòng theo dõi lịch nhận phòng.",
                            "BOOKING_CREATED",
                            "BOOKING",
                            "/hotel-admin"
                    );
                }

                List<UUID> savedRoomIds = savedBookings.stream().map(Booking::getRoomId).toList();
                String eventType = request.paymentOption() == PaymentOption.PAY_AT_HOTEL
                        ? "CONFIRMED"
                        : "HELD";
                afterCommit(() -> {
                    if (request.paymentOption() == PaymentOption.PAY_AT_HOTEL) {
                        roomHoldService.release(roomHold);
                    }
                    realtimeService.publish(AvailabilityEvent.of(
                            eventType,
                            first.getHotelId(),
                            savedRoomIds,
                            first.getCheckIn(),
                            first.getCheckOut(),
                            paymentExpiresAt
                    ));
                });
            }

            return savedBookings.stream().map(BookingResponse::from).toList();
        } catch (RuntimeException exception) {
            roomHoldService.release(roomHold);
            throw exception;
        }
    }

    @Transactional
    public BookingHoldResponse createRoomHold(
            UUID customerId,
            CreateRoomHoldRequest request
    ) {
        validateDateRange(request.checkIn(), request.checkOut());
        HotelClient.HotelDetails hotel = hotelClient.getHotel(request.hotelId());
        if (hotel.ownerId() == null) {
            throw new IllegalStateException("Khách sạn chưa có chủ sở hữu");
        }
        ownerDemotionFenceService.assertLiabilityCreationAllowed(hotel.ownerId());
        List<UUID> roomIds = request.roomIds().stream().distinct().toList();
        if (roomIds.size() != request.roomIds().size()) {
            throw new IllegalArgumentException("Danh sách phòng có dữ liệu trùng lặp");
        }

        Instant now = Instant.now();
        LocalDate today = LocalDate.now(HOTEL_TIME_ZONE);
        for (UUID roomId : roomIds) {
            if (bookingRepository.existsOverlappingBooking(
                    roomId, request.checkIn(), request.checkOut(), now
            )) {
                throw new RoomAlreadyBookedException();
            }

            HotelClient.RoomDetails room = hotelClient.getRoom(roomId);
            if (!request.hotelId().equals(room.hotelId())) {
                throw new IllegalArgumentException("Phòng không thuộc khách sạn đã chọn");
            }
            String roomStatus = room.status() == null ? "" : room.status().toUpperCase();
            if (!request.checkIn().isAfter(today) && !"AVAILABLE".equals(roomStatus)) {
                throw new IllegalArgumentException(
                        "Phòng " + room.roomNumber() + " chưa sẵn sàng để nhận khách hôm nay"
                );
            }
            if ("MAINTENANCE".equals(roomStatus) || "INACTIVE".equals(roomStatus)) {
                throw new IllegalArgumentException(
                        "Phòng " + room.roomNumber() + " hiện không được mở bán"
                );
            }
        }

        RoomHoldService.Hold hold;
        UUID token = request.holdToken() != null
                ? request.holdToken()
                : UUID.randomUUID();
        RoomHoldService.HoldMetadata existing = roomHoldService.getMetadata(token);
        if (existing != null) {
            hold = roomHoldService.reuseExisting(
                    token, customerId, request.hotelId(), roomIds,
                    request.checkIn(), request.checkOut()
            );
        } else {
            hold = roomHoldService.acquire(
                    token, customerId, request.hotelId(), roomIds,
                    request.checkIn(), request.checkOut()
            );
            realtimeService.publish(AvailabilityEvent.of(
                    "HELD", request.hotelId(), roomIds,
                    request.checkIn(), request.checkOut(), hold.expiresAt()
            ));
        }

        return new BookingHoldResponse(
                UUID.fromString(hold.metadata().token()),
                request.hotelId(),
                roomIds,
                request.checkIn(),
                request.checkOut(),
                hold.expiresAt()
        );
    }

    @Transactional(readOnly = true)
    public BookingResponse getById(UUID bookingId) {
        return BookingResponse.from(findBooking(bookingId));
    }

    @Transactional(readOnly = true)
    public String getCheckInQrPayload(UUID bookingId) {
        Booking booking = findBooking(bookingId);
        return booking.getCheckInCode();
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getByCustomer(UUID customerId) {
        return bookingRepository
                .findAllByCustomerIdAndCustomerHiddenFalseOrderByCreatedAtDesc(customerId)
                .stream().map(BookingResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getByHotel(UUID hotelId) {
        return bookingRepository.findAllByHotelIdOrderByCreatedAtDesc(hotelId)
                .stream().map(BookingResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getByStatus(BookingStatus status) {
        return bookingRepository.findAllByStatusOrderByCreatedAtDesc(status)
                .stream().map(BookingResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public RoleChangeBookingEligibilityResponse getRoleChangeEligibility(
            RoleChangeBookingEligibilityRequest request
    ) {
        List<UUID> hotelIds = request.hotelIds().stream().distinct().toList();
        if (hotelIds.isEmpty()) {
            return new RoleChangeBookingEligibilityResponse(
                    true,
                    0,
                    0,
                    List.of()
            );
        }

        long currentStayCount = bookingRepository.countByHotelIdInAndStatus(
                hotelIds,
                BookingStatus.CHECKED_IN
        );
        long actionableBookingCount = bookingRepository.countActionableBookings(
                hotelIds,
                List.of(BookingStatus.PENDING, BookingStatus.CONFIRMED),
                Instant.now(),
                LocalDate.now(HOTEL_TIME_ZONE)
        );

        List<String> blockers = new ArrayList<>();
        if (currentStayCount > 0) {
            blockers.add("Còn " + currentStayCount + " khách đang lưu trú");
        }
        if (actionableBookingCount > 0) {
            blockers.add("Còn " + actionableBookingCount + " booking cần xử lý");
        }

        return new RoleChangeBookingEligibilityResponse(
                blockers.isEmpty(),
                currentStayCount,
                actionableBookingCount,
                List.copyOf(blockers)
        );
    }

    @Transactional(readOnly = true)
    public AvailabilityResponse getAvailability(
            UUID hotelId,
            LocalDate checkIn,
            LocalDate checkOut
    ) {
        return getAvailability(hotelId, checkIn, checkOut, null);
    }

    @Transactional(readOnly = true)
    public AvailabilityResponse getAvailability(
            UUID hotelId,
            LocalDate checkIn,
            LocalDate checkOut,
            UUID ignoredHoldToken
    ) {
        validateDateRange(checkIn, checkOut);
        Instant now = Instant.now();

        LinkedHashSet<UUID> unavailableRoomIds = new LinkedHashSet<>(
                bookingRepository.findUnavailableRoomIds(
                        hotelId, checkIn, checkOut, now
                )
        );

        Map<UUID, Instant> holdExpiryByRoom = new LinkedHashMap<>();
        bookingRepository.findActivePendingPayments(
                        hotelId, checkIn, checkOut, now
                )
                .forEach(booking -> holdExpiryByRoom.merge(
                        booking.getRoomId(),
                        booking.getPaymentExpiresAt(),
                        (first, second) -> first.isAfter(second) ? first : second
                ));

        for (RoomHoldResponse hold : roomHoldService.findActiveHolds(
                hotelId, checkIn, checkOut, ignoredHoldToken
        )) {
            holdExpiryByRoom.merge(
                    hold.roomId(),
                    hold.expiresAt(),
                    (first, second) -> first.isAfter(second) ? first : second
            );
        }

        unavailableRoomIds.addAll(holdExpiryByRoom.keySet());
        List<RoomHoldResponse> heldRooms = holdExpiryByRoom.entrySet().stream()
                .map(entry -> new RoomHoldResponse(entry.getKey(), entry.getValue()))
                .toList();

        return new AvailabilityResponse(
                hotelId,
                checkIn,
                checkOut,
                List.copyOf(unavailableRoomIds),
                heldRooms
        );
    }

    @Transactional
    public BookingResponse applyPayment(UUID bookingId, ApplyPaymentRequest request) {
        Booking booking = findBooking(bookingId);
        booking.applyPayment(request.amount(), request.paymentType());
        HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.getHotelId());
        String paymentTitle = booking.getPaymentStatus() == BookingPaymentStatus.PAID
                ? "Thanh toán thành công" : "Đã ghi nhận thanh toán";
        notificationClient.sendUser(
                booking.getCustomerId(),
                paymentTitle,
                "Booking " + booking.getBookingCode() + " tại " + hotel.name()
                        + " đã ghi nhận thanh toán. Còn phải thu: " + booking.getRemainingAmount() + " đ.",
                "PAYMENT_SUCCESS",
                "PAYMENT",
                "/customer/bookings"
        );
        if (hotel.ownerId() != null) {
            notificationClient.sendUser(
                    hotel.ownerId(),
                    "Khách đã thanh toán",
                    "Booking " + booking.getBookingCode() + " đã cập nhật thanh toán.",
                    "PAYMENT_SUCCESS",
                    "PAYMENT",
                    "/hotel-admin"
            );
        }
        afterCommit(() -> {
            roomHoldService.releaseByBookingGroup(booking.getBookingGroupId());
            realtimeService.publish(AvailabilityEvent.of(
                    "CONFIRMED", booking.getHotelId(), List.of(booking.getRoomId()),
                    booking.getCheckIn(), booking.getCheckOut(), null
            ));
        });
        return BookingResponse.from(booking);
    }

    @Transactional
    public BookingResponse markPaymentFailed(UUID bookingId) {
        Booking booking = findBooking(bookingId);
        booking.markPaymentFailed();
        notificationClient.sendUser(
                booking.getCustomerId(),
                "Thanh toán chưa thành công",
                "Thanh toán cho booking " + booking.getBookingCode() + " chưa hoàn tất. Bạn có thể thử lại từ Đơn đặt phòng.",
                "PAYMENT_FAILED",
                "PAYMENT",
                "/customer/bookings"
        );
        return BookingResponse.from(booking);
    }

    @Transactional
    public BookingResponse markRefunded(UUID bookingId) {
        Booking booking = findBooking(bookingId);
        booking.markRefunded();
        afterCommit(() -> {
            roomHoldService.releaseByBookingGroup(booking.getBookingGroupId());
            realtimeService.publish(AvailabilityEvent.of(
                    "RELEASED", booking.getHotelId(), List.of(booking.getRoomId()),
                    booking.getCheckIn(), booking.getCheckOut(), null
            ));
        });
        return BookingResponse.from(booking);
    }

    @Transactional
    public BookingResponse confirm(UUID bookingId) {
        Booking booking = findBooking(bookingId);
        booking.confirm();
        notificationClient.sendUser(
                booking.getCustomerId(),
                "Booking đã được xác nhận",
                "Booking " + booking.getBookingCode() + " đã được xác nhận. QR nhận phòng đã sẵn sàng.",
                "BOOKING_CONFIRMED",
                "BOOKING",
                "/customer/bookings"
        );
        afterCommit(() -> {
            roomHoldService.releaseByBookingGroup(booking.getBookingGroupId());
            realtimeService.publish(AvailabilityEvent.of(
                    "CONFIRMED", booking.getHotelId(), List.of(booking.getRoomId()),
                    booking.getCheckIn(), booking.getCheckOut(), null
            ));
        });
        return BookingResponse.from(booking);
    }

    @Transactional(readOnly = true)
    public CheckInDetailsResponse verifyCheckIn(UUID hotelAdminId, String rawCode) {
        Booking booking = findByCheckInCode(rawCode);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);
        return toCheckInDetails(context);
    }

    public CheckInDetailsResponse collectAtHotel(
            UUID hotelAdminId,
            UUID bookingId,
            String rawCode
    ) {
        throw new IllegalStateException(
                "Không được ghi nhận tiền mặt trực tiếp tại Booking Service. "
                        + "Hãy dùng Payment Service để hạch toán hoa hồng hệ thống."
        );
    }

    @Transactional
    public CheckInDetailsResponse completeCheckIn(
            UUID hotelAdminId,
            UUID bookingId,
            String rawCode,
            String bearerToken
    ) {
        Booking booking = findBooking(bookingId);
        ensureCodeMatches(booking, rawCode);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);
        validateCheckInDate(booking);
        booking.checkIn();
        hotelClient.updateRoomStatus(context.room(), "OCCUPIED", bearerToken);
        notificationClient.sendUser(
                booking.getCustomerId(),
                "Đã nhận phòng",
                "Bạn đã check-in booking " + booking.getBookingCode() + " tại " + context.hotel().name() + ". Chúc bạn có kỳ nghỉ vui vẻ!",
                "BOOKING_CHECKED_IN",
                "BOOKING",
                "/customer/bookings"
        );
        return toCheckInDetails(context);
    }

    @Transactional
    public BookingResponse checkIn(UUID hotelAdminId, UUID bookingId, String bearerToken) {
        Booking booking = findBooking(bookingId);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);
        validateCheckInDate(booking);
        booking.checkIn();
        hotelClient.updateRoomStatus(context.room(), "OCCUPIED", bearerToken);
        notificationClient.sendUser(
                booking.getCustomerId(),
                "Đã nhận phòng",
                "Bạn đã check-in booking " + booking.getBookingCode() + " tại " + context.hotel().name() + ".",
                "BOOKING_CHECKED_IN",
                "BOOKING",
                "/customer/bookings"
        );
        return BookingResponse.from(booking);
    }

    @Transactional(readOnly = true)
    public List<CheckInDetailsResponse> getCurrentStays(UUID hotelAdminId) {
        return bookingRepository.findAllByStatusOrderByCreatedAtDesc(BookingStatus.CHECKED_IN)
                .stream()
                .map(booking -> {
                    try {
                        return requireOwnedBooking(hotelAdminId, booking);
                    } catch (IllegalStateException exception) {
                        return null;
                    }
                })
                .filter(context -> context != null)
                .map(this::toCheckInDetails)
                .toList();
    }

    @Transactional
    public CheckInDetailsResponse assessLateCheckoutFee(
            UUID hotelAdminId,
            UUID bookingId
    ) {
        Booking booking = findBooking(bookingId);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);

        if (booking.getStatus() != BookingStatus.CHECKED_IN) {
            throw new IllegalStateException("Chỉ booking đang lưu trú mới có thể chốt phí trả phòng trễ");
        }

        LocalTime checkOutTime = context.hotel().checkOutTime() != null
                ? context.hotel().checkOutTime()
                : LocalTime.NOON;
        LocalDateTime expectedCheckOutAt = LocalDateTime.of(
                booking.getCheckOut(), checkOutTime
        );

        PricingService.LateCheckoutQuote quote = pricingService.lateCheckoutQuote(
                booking, expectedCheckOutAt, Instant.now()
        );

        booking.assessLateCheckoutFee(quote.estimatedFee(), Instant.now());

        if (booking.getLateCheckoutFee().signum() > 0) {
            notificationClient.sendUser(
                    booking.getCustomerId(),
                    "Phát sinh phí trả phòng trễ",
                    "Booking " + booking.getBookingCode()
                            + " đã chốt phí trả phòng trễ "
                            + booking.getLateCheckoutFee().stripTrailingZeros().toPlainString()
                            + " ₫. Vui lòng thanh toán trước khi hoàn tất trả phòng.",
                    "BOOKING_LATE_CHECKOUT_FEE",
                    "BOOKING",
                    "/customer/bookings"
            );
        }

        return toCheckInDetails(context);
    }

    @Transactional
    public CheckInDetailsResponse checkOut(
            UUID hotelAdminId,
            UUID bookingId,
            String bearerToken
    ) {
        Booking booking = findBooking(bookingId);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);

        LocalTime checkOutTime = context.hotel().checkOutTime() != null
                ? context.hotel().checkOutTime()
                : LocalTime.NOON;
        LocalDateTime expectedCheckOutAt = LocalDateTime.of(
                booking.getCheckOut(), checkOutTime
        );
        PricingService.LateCheckoutQuote quote = pricingService.lateCheckoutQuote(
                booking, expectedCheckOutAt, Instant.now()
        );
        if (quote.estimatedFee().signum() > 0 && booking.getLateFeeAssessedAt() == null) {
            throw new IllegalStateException(
                    "Khách đã quá giờ trả phòng. Hãy chốt phí trả phòng trễ trước khi checkout."
            );
        }

        booking.checkOut();
        hotelClient.updateRoomStatus(context.room(), "CLEANING", bearerToken);
        notificationClient.sendUser(
                booking.getCustomerId(),
                "Bạn đã trả phòng",
                "Booking " + booking.getBookingCode() + " đã hoàn tất. Hãy chia sẻ đánh giá về " + context.hotel().name() + ".",
                "BOOKING_CHECKED_OUT",
                "REVIEW",
                "/customer/bookings"
        );
        return toCheckInDetails(context);
    }

    @Transactional
    public BookingResponse cancel(UUID customerId, UUID bookingId) {
        Booking booking = findBooking(bookingId);
        if (!booking.getCustomerId().equals(customerId)) {
            throw new IllegalArgumentException("Booking không thuộc khách hàng hiện tại");
        }
        booking.cancel();
        HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.getHotelId());
        notificationClient.sendUser(
                booking.getCustomerId(),
                "Booking đã hủy",
                "Booking " + booking.getBookingCode() + " tại " + hotel.name() + " đã được hủy.",
                "BOOKING_CANCELLED",
                "BOOKING",
                "/customer/bookings"
        );
        if (hotel.ownerId() != null) {
            notificationClient.sendUser(
                    hotel.ownerId(),
                    "Khách đã hủy booking",
                    "Booking " + booking.getBookingCode() + " đã bị khách hủy.",
                    "BOOKING_CANCELLED",
                    "BOOKING",
                    "/hotel-admin"
            );
        }
        afterCommit(() -> {
            roomHoldService.releaseByBookingGroup(booking.getBookingGroupId());
            realtimeService.publish(AvailabilityEvent.of(
                    "RELEASED", booking.getHotelId(), List.of(booking.getRoomId()),
                    booking.getCheckIn(), booking.getCheckOut(), null
            ));
        });
        return BookingResponse.from(booking);
    }


    @Transactional
    public void hideFromCustomer(UUID customerId, UUID bookingId) {
        Booking booking = findBooking(bookingId);
        booking.hideFromCustomer(customerId);
    }

    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            try {
                                action.run();
                            } catch (RuntimeException ignored) {
                                // Booking đã commit; realtime/Redis cleanup không được làm hỏng response.
                            }
                        }
                    }
            );
            return;
        }
        action.run();
    }

    private Booking findBooking(UUID bookingId) {
        return bookingRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException(bookingId));
    }

    private Booking findByCheckInCode(String rawCode) {
        String code = normalizeCheckInCode(rawCode);
        return bookingRepository.findByCheckInCode(code)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Mã QR không hợp lệ hoặc không thuộc booking nào"
                ));
    }

    private OwnedBookingContext requireOwnedBooking(
            UUID hotelAdminId,
            Booking booking
    ) {
        HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.getHotelId());
        if (hotel.ownerId() == null || !hotel.ownerId().equals(hotelAdminId)) {
            throw new IllegalStateException(
                    "Booking không thuộc khách sạn do tài khoản này quản lý"
            );
        }

        HotelClient.RoomDetails room = hotelClient.getRoom(booking.getRoomId());
        HotelClient.RoomTypeDetails roomType = hotelClient.getRoomType(booking.getRoomTypeId());
        return new OwnedBookingContext(booking, hotel, room, roomType);
    }

    private CheckInDetailsResponse toCheckInDetails(OwnedBookingContext context) {
        Booking booking = context.booking();
        LocalDate today = LocalDate.now(HOTEL_TIME_ZONE);
        boolean dateValid = !today.isBefore(booking.getCheckIn())
                && today.isBefore(booking.getCheckOut());
        boolean paymentComplete = booking.getPaymentStatus() == BookingPaymentStatus.PAID
                && booking.getRemainingAmount().signum() == 0;
        boolean canCheckIn = booking.getStatus() == BookingStatus.CONFIRMED
                && dateValid
                && paymentComplete;

        String actionMessage;
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            actionMessage = "Booking đã bị hủy";
        } else if (booking.getStatus() == BookingStatus.CHECKED_IN) {
            actionMessage = "Khách đã nhận phòng";
        } else if (booking.getStatus() == BookingStatus.CHECKED_OUT) {
            actionMessage = "Booking đã hoàn tất trả phòng";
        } else if (today.isBefore(booking.getCheckIn())) {
            actionMessage = "Chưa đến ngày nhận phòng";
        } else if (!today.isBefore(booking.getCheckOut())) {
            actionMessage = "Đã qua thời gian nhận phòng của booking";
        } else if (!paymentComplete) {
            actionMessage = "Khách còn phải thanh toán "
                    + booking.getRemainingAmount().stripTrailingZeros().toPlainString()
                    + " ₫ trước khi nhận phòng";
        } else if (booking.getStatus() != BookingStatus.CONFIRMED) {
            actionMessage = "Booking chưa ở trạng thái sẵn sàng nhận phòng";
        } else {
            actionMessage = "Booking hợp lệ, có thể xác nhận nhận phòng";
        }

        String address = String.join(", ", List.of(
                safe(context.hotel().address()),
                safe(context.hotel().city())
        ).stream().filter(value -> !value.isBlank()).toList());

        LocalTime checkInTime = context.hotel().checkInTime() != null
                ? context.hotel().checkInTime()
                : LocalTime.of(14, 0);
        LocalTime checkOutTime = context.hotel().checkOutTime() != null
                ? context.hotel().checkOutTime()
                : LocalTime.NOON;

        LocalDateTime expectedCheckInAt = LocalDateTime.of(booking.getCheckIn(), checkInTime);
        LocalDateTime expectedCheckOutAt = LocalDateTime.of(booking.getCheckOut(), checkOutTime);

        PricingService.LateCheckoutQuote lateQuote = pricingService.lateCheckoutQuote(
                booking, expectedCheckOutAt, Instant.now()
        );
        boolean canCheckOut = booking.getStatus() == BookingStatus.CHECKED_IN
                && booking.getRemainingAmount().signum() == 0
                && booking.getPaymentStatus() == BookingPaymentStatus.PAID
                && (lateQuote.estimatedFee().signum() == 0
                    || booking.getLateFeeAssessedAt() != null);

        LateCheckoutDetailsResponse lateCheckout = new LateCheckoutDetailsResponse(
                lateQuote.overdue(),
                lateQuote.overdueMinutes(),
                lateQuote.graceMinutes(),
                lateQuote.feeAssessed(),
                lateQuote.feeAssessedAt(),
                lateQuote.assessedFee(),
                lateQuote.estimatedFee(),
                lateQuote.feePercent(),
                lateQuote.chargedNights(),
                lateQuote.policyLabel(),
                booking.getRemainingAmount().signum() > 0,
                canCheckOut
        );

        return new CheckInDetailsResponse(
                BookingResponse.from(booking),
                context.hotel().name(),
                address,
                context.room().roomNumber(),
                context.roomType().name(),
                expectedCheckInAt,
                expectedCheckOutAt,
                booking.getCheckedInAt(),
                booking.getCheckedOutAt(),
                dateValid,
                paymentComplete,
                canCheckIn,
                canCheckOut,
                lateCheckout,
                actionMessage
        );
    }

    private void validateCheckInDate(Booking booking) {
        LocalDate today = LocalDate.now(HOTEL_TIME_ZONE);
        if (today.isBefore(booking.getCheckIn())) {
            throw new IllegalStateException("Chưa đến ngày nhận phòng");
        }
        if (!today.isBefore(booking.getCheckOut())) {
            throw new IllegalStateException("Đã qua thời gian nhận phòng của booking");
        }
    }

    private void ensureCodeMatches(Booking booking, String rawCode) {
        String code = normalizeCheckInCode(rawCode);
        if (!booking.getCheckInCode().equals(code)) {
            throw new IllegalArgumentException("Mã QR không khớp với booking");
        }
    }

    private String normalizeCheckInCode(String rawCode) {
        if (rawCode == null || rawCode.isBlank()) {
            throw new IllegalArgumentException("Mã QR check-in không được để trống");
        }

        String value = rawCode.trim();
        int tokenIndex = value.indexOf("token=");
        if (tokenIndex >= 0) {
            String token = value.substring(tokenIndex + "token=".length());
            int ampersand = token.indexOf('&');
            if (ampersand >= 0) token = token.substring(0, ampersand);
            value = URLDecoder.decode(token, StandardCharsets.UTF_8);
        }
        return value.trim();
    }

    private void validateDateRange(LocalDate checkIn, LocalDate checkOut) {
        if (!checkOut.isAfter(checkIn)) {
            throw new IllegalArgumentException(
                    "Ngày trả phòng phải sau ngày nhận phòng"
            );
        }
    }

    private void validateGuestAndInvoiceInformation(CreateBookingBatchRequest request) {
        if (!request.bookerIsGuest()) {
            if (isBlank(request.guestFirstName()) || isBlank(request.guestLastName())) {
                throw new IllegalArgumentException(
                        "Vui lòng nhập họ và tên của khách lưu trú"
                );
            }
        }
        if (request.invoiceRequested()) {
            if (isBlank(request.invoiceCompanyName())
                    || isBlank(request.invoiceTaxCode())
                    || isBlank(request.invoiceAddress())
                    || isBlank(request.invoiceEmail())) {
                throw new IllegalArgumentException(
                        "Vui lòng nhập đầy đủ thông tin xuất hóa đơn"
                );
            }
        }
    }

    private void validatePaymentOption(
            PaymentOption option,
            HotelClient.RoomTypeDetails roomType
    ) {
        boolean allowed = switch (option) {
            case PAY_AT_HOTEL -> roomType.payAtHotelAllowed();
            case DEPOSIT -> roomType.depositAllowed();
            case FULL_PAYMENT -> roomType.fullPaymentAllowed();
        };

        if (!allowed) {
            throw new IllegalArgumentException(
                    "Loại phòng " + roomType.name()
                            + " không hỗ trợ phương thức thanh toán đã chọn"
            );
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private record ResolvedRoom(
            HotelClient.RoomDetails room,
            HotelClient.RoomTypeDetails roomType,
            PricingService.RoomPricing pricing
    ) {
    }

    private record OwnedBookingContext(
            Booking booking,
            HotelClient.HotelDetails hotel,
            HotelClient.RoomDetails room,
            HotelClient.RoomTypeDetails roomType
    ) {
    }
}
