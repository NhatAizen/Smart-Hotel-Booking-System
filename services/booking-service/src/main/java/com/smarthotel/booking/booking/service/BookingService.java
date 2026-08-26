package com.smarthotel.booking.booking.service;

import com.smarthotel.booking.booking.dto.ApplyPaymentRequest;
import com.smarthotel.booking.booking.dto.AvailabilityResponse;
import com.smarthotel.booking.booking.dto.BookingResponse;
import com.smarthotel.booking.booking.dto.BookingHoldResponse;
import com.smarthotel.booking.booking.dto.CreateRoomHoldRequest;
import com.smarthotel.booking.booking.dto.CheckInDetailsResponse;
import com.smarthotel.booking.booking.dto.CheckInIdentityVerificationResponse;
import com.smarthotel.booking.booking.dto.CreateBookingBatchRequest;
import com.smarthotel.booking.booking.dto.CreateBookingRequest;
import com.smarthotel.booking.booking.dto.RoomHoldResponse;
import com.smarthotel.booking.booking.dto.RoleChangeBookingEligibilityRequest;
import com.smarthotel.booking.booking.dto.RoleChangeBookingEligibilityResponse;
import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingPaymentStatus;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.entity.CheckInIdentityStatus;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.booking.identity.VietnamCitizenIdQrParser;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.booking.realtime.AvailabilityEvent;
import com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService;
import com.smarthotel.booking.common.exception.BookingNotFoundException;
import com.smarthotel.booking.common.exception.RoomAlreadyBookedException;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.pricing.dto.LateCheckoutDetailsResponse;
import com.smarthotel.booking.pricing.service.PricingService;
import com.smarthotel.booking.promotion.service.PromotionService;
import com.smarthotel.booking.rolechange.fence.OwnerDemotionFenceService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.text.Normalizer;
import java.util.Locale;

@Service
public class BookingService {

    private static final ZoneId HOTEL_TIME_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final BookingRepository bookingRepository;
    private final HotelClient hotelClient;
    private final NotificationClient notificationClient;
    private final RoomHoldService roomHoldService;
    private final AvailabilityRealtimeService realtimeService;
    private final PricingService pricingService;
    private final PromotionService promotionService;
    private final OwnerDemotionFenceService ownerDemotionFenceService;

    public BookingService(
            BookingRepository bookingRepository,
            HotelClient hotelClient,
            NotificationClient notificationClient,
            RoomHoldService roomHoldService,
            AvailabilityRealtimeService realtimeService,
            PricingService pricingService,
            PromotionService promotionService,
            OwnerDemotionFenceService ownerDemotionFenceService
    ) {
        this.bookingRepository = bookingRepository;
        this.hotelClient = hotelClient;
        this.notificationClient = notificationClient;
        this.roomHoldService = roomHoldService;
        this.realtimeService = realtimeService;
        this.pricingService = pricingService;
        this.promotionService = promotionService;
        this.ownerDemotionFenceService = ownerDemotionFenceService;
    }

    @Transactional
    public BookingResponse create(CreateBookingRequest request) {
        return createBatch(request.toBatch()).get(0);
    }

    @Transactional
    public List<BookingResponse> createBatch(CreateBookingBatchRequest request) {
        validateDateRange(request.checkIn(), request.checkOut());
        validateBookerAge(request);
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

        BigDecimal groupGross = resolvedRooms.stream()
                .map(item -> item.pricing().totalAmount())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        PromotionService.DiscountPlan discountPlan = promotionService.plan(
                request.customerId(), request.hotelId(), groupGross,
                request.hotelPromotionCode(), request.platformPromotionCode()
        );
        List<BigDecimal> membershipShares = allocateDiscount(
                discountPlan.membershipDiscount(), resolvedRooms
        );
        List<BigDecimal> hotelPromotionShares = allocateDiscount(
                discountPlan.hotelPromotionDiscount(), resolvedRooms
        );
        List<BigDecimal> platformPromotionShares = allocateDiscount(
                discountPlan.platformPromotionDiscount(), resolvedRooms
        );

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

            List<Booking> bookings = new ArrayList<>();
            for (int roomIndex = 0; roomIndex < resolvedRooms.size(); roomIndex++) {
                ResolvedRoom item = resolvedRooms.get(roomIndex);
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
                        request.bookerDateOfBirth(),
                        request.ageConfirmed(),
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
                booking.applyDiscountSnapshot(
                        discountPlan.membership().level(),
                        membershipShares.get(roomIndex),
                        discountPlan.hotelPromotion() == null ? null : discountPlan.hotelPromotion().getCode(),
                        hotelPromotionShares.get(roomIndex),
                        discountPlan.platformPromotion() == null ? null : discountPlan.platformPromotion().getCode(),
                        platformPromotionShares.get(roomIndex)
                );
                bookings.add(booking);
            }

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

            promotionService.recordUsage(discountPlan, request.customerId(), bookingGroupId);
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

    @Transactional
    public CheckInDetailsResponse verifyCheckIn(UUID hotelAdminId, String rawCode) {
        Booking booking = findByCheckInCode(rawCode);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);

        // Một lần quét QR booking mới phải bắt đầu một phiên xác minh sạch.
        // Chỉ xóa kết quả FAILED cũ; VERIFIED vẫn được giữ lại để làm bằng chứng
        // Hotel Admin đã xác minh thành công trước đó.
        if (booking.getIdentityVerificationStatus() == CheckInIdentityStatus.FAILED) {
            booking.resetFailedIdentityVerification();
        }

        return toCheckInDetails(context);
    }

    @Transactional
    public CheckInDetailsResponse verifyCheckInIdentity(
            UUID hotelAdminId,
            UUID bookingId,
            String rawCode,
            String identityQrData
    ) {
        Booking booking = findBooking(bookingId);
        ensureCodeMatches(booking, rawCode);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);
        validateCheckInDate(booking, context.hotel());

        VietnamCitizenIdQrParser.CitizenIdQrData citizen =
                VietnamCitizenIdQrParser.parse(identityQrData);

        String expectedName = identitySubjectName(booking);
        LocalDate expectedDateOfBirth = identityExpectedDateOfBirth(booking);

        boolean nameMatched = normalizedPersonName(expectedName)
                .equals(normalizedPersonName(citizen.fullName()));
        boolean dateOfBirthMatched = expectedDateOfBirth == null
                || expectedDateOfBirth.equals(citizen.dateOfBirth());

        int ageAtCheckIn = Period.between(
                citizen.dateOfBirth(), booking.getCheckIn()
        ).getYears();
        boolean ageEligible = !citizen.dateOfBirth().isAfter(booking.getCheckIn())
                && ageAtCheckIn >= 18;

        // Họ tên tài khoản/booking có thể là tên hiển thị hoặc được nhập tự do.
        // Vì vậy tên đọc từ CCCD chỉ mang tính tham khảo, KHÔNG phải điều kiện
        // để cho phép/từ chối check-in. Hệ thống chỉ dùng ngày sinh thực tế
        // trên CCCD để đối chiếu ngày sinh đã khai và kiểm tra đủ 18 tuổi.
        String failureReason = null;
        if (!dateOfBirthMatched) {
            failureReason = "DATE_OF_BIRTH_MISMATCH";
        } else if (!ageEligible) {
            failureReason = "UNDERAGE";
        }

        String identityNumber = citizen.identityNumber();
        String last4 = identityNumber.length() <= 4
                ? identityNumber
                : identityNumber.substring(identityNumber.length() - 4);

        booking.recordIdentityVerification(
                nameMatched,
                dateOfBirthMatched,
                ageEligible,
                ageAtCheckIn,
                last4,
                hotelAdminId,
                failureReason
        );

        // Booking cũ được tạo trước khi có nghiệp vụ tuổi có thể chưa có snapshot DOB.
        // Nếu chính người đặt cũng là khách lưu trú và CCCD đã xác minh thành công,
        // lưu DOB làm snapshot để những lần kiểm tra sau vẫn có dữ liệu đối chiếu.
        if (booking.isIdentityVerified()
                && booking.isBookerIsGuest()
                && booking.getBookerDateOfBirth() == null) {
            booking.captureLegacyBookerDateOfBirth(citizen.dateOfBirth());
        }

        return toCheckInDetails(context);
    }

    @Transactional
    public CheckInDetailsResponse verifyCheckInIdentityManual(
            UUID hotelAdminId,
            UUID bookingId,
            String rawCode
    ) {
        Booking booking = findBooking(bookingId);
        ensureCodeMatches(booking, rawCode);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);
        validateCheckInDate(booking, context.hotel());

        LocalDate expectedDateOfBirth = identityExpectedDateOfBirth(booking);
        Integer ageAtCheckIn = null;
        Boolean ageEligible = true;
        Boolean dateOfBirthMatched = null;

        if (expectedDateOfBirth != null) {
            if (expectedDateOfBirth.isAfter(booking.getCheckIn())) {
                throw new IllegalStateException("Ngày sinh người nhận phòng không hợp lệ");
            }
            ageAtCheckIn = Period.between(expectedDateOfBirth, booking.getCheckIn()).getYears();
            ageEligible = ageAtCheckIn >= 18;
            dateOfBirthMatched = true;
            if (!ageEligible) {
                throw new IllegalStateException(
                        "Người đại diện nhận phòng chưa đủ 18 tuổi"
                );
            }
        }

        booking.recordManualIdentityVerification(
                dateOfBirthMatched,
                ageEligible,
                ageAtCheckIn,
                hotelAdminId
        );

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
        validateCheckInDate(booking, context.hotel());
        ensureIdentityVerified(booking);
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
        validateCheckInDate(booking, context.hotel());
        ensureIdentityVerified(booking);
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

    @Transactional
    public List<CheckInDetailsResponse> getCurrentStays(UUID hotelAdminId) {
        Instant now = Instant.now();
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
                .map(context -> {
                    refreshLateCheckoutFee(context.booking(), context.hotel(), now);
                    return toCheckInDetails(context);
                })
                .toList();
    }

    /**
     * Cập nhật phí trả trễ cho toàn bộ booking đang lưu trú.
     * Scheduler gọi hàm này định kỳ để phí tiếp tục tăng ngay cả khi Hotel Admin
     * không mở trang "Khách đang lưu trú".
     */
    @Transactional
    public int refreshActiveLateCheckoutFees() {
        Instant now = Instant.now();
        int changed = 0;

        for (Booking booking : bookingRepository
                .findAllByStatusOrderByCreatedAtDesc(BookingStatus.CHECKED_IN)) {
            try {
                HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.getHotelId());
                BigDecimal before = booking.getLateCheckoutFee() == null
                        ? BigDecimal.ZERO
                        : booking.getLateCheckoutFee();

                refreshLateCheckoutFee(booking, hotel, now);

                BigDecimal after = booking.getLateCheckoutFee() == null
                        ? BigDecimal.ZERO
                        : booking.getLateCheckoutFee();
                if (after.compareTo(before) > 0) {
                    changed++;
                    BigDecimal notifiedFee = after;
                    afterCommit(() -> notificationClient.sendUser(
                            booking.getCustomerId(),
                            "Phụ thu trả phòng trễ đã cập nhật",
                            "Booking " + booking.getBookingCode()
                                    + " hiện có phụ thu trả trễ "
                                    + notifiedFee.stripTrailingZeros().toPlainString()
                                    + " ₫. Phí tiếp tục được tính cho đến khi hoàn tất checkout.",
                            "BOOKING_LATE_CHECKOUT_FEE",
                            "BOOKING",
                            "/customer/bookings"
                    ));
                }
            } catch (RuntimeException ignored) {
                // Một booking lỗi dữ liệu/Hotel Service không được làm dừng việc
                // cập nhật phí cho các booking đang lưu trú còn lại.
            }
        }
        return changed;
    }

    @Transactional
    public CheckInDetailsResponse assessLateCheckoutFee(
            UUID hotelAdminId,
            UUID bookingId
    ) {
        Booking booking = findBooking(bookingId);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);

        if (booking.getStatus() != BookingStatus.CHECKED_IN) {
            throw new IllegalStateException("Chỉ booking đang lưu trú mới có thể cập nhật phí trả phòng trễ");
        }

        BigDecimal before = booking.getLateCheckoutFee() == null
                ? BigDecimal.ZERO
                : booking.getLateCheckoutFee();
        refreshLateCheckoutFee(booking, context.hotel(), Instant.now());
        BigDecimal after = booking.getLateCheckoutFee() == null
                ? BigDecimal.ZERO
                : booking.getLateCheckoutFee();

        if (after.compareTo(before) > 0) {
            afterCommit(() -> notificationClient.sendUser(
                    booking.getCustomerId(),
                    "Phụ thu trả phòng trễ đã cập nhật",
                    "Booking " + booking.getBookingCode()
                            + " hiện có phụ thu trả trễ "
                            + after.stripTrailingZeros().toPlainString()
                            + " ₫. Phí sẽ tiếp tục tăng theo thời gian cho đến khi checkout.",
                    "BOOKING_LATE_CHECKOUT_FEE",
                    "BOOKING",
                    "/customer/bookings"
            ));
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

        // Tính lại đúng tại thời điểm bấm checkout. Nếu khách đã bước sang mốc
        // phụ thu mới thì remainingAmount sẽ tăng và Booking.checkOut() tự chặn
        // cho đến khi khoản phát sinh được thanh toán đủ.
        refreshLateCheckoutFee(booking, context.hotel(), Instant.now());

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
    public BookingResponse markNoShow(UUID hotelAdminId, UUID bookingId) {
        Booking booking = findBooking(bookingId);
        OwnedBookingContext context = requireOwnedBooking(hotelAdminId, booking);
        if (booking.getStatus() == BookingStatus.NO_SHOW) {
            return BookingResponse.from(booking);
        }
        if (booking.getStatus() != BookingStatus.CONFIRMED) {
            throw new IllegalStateException("Chỉ booking đã xác nhận nhưng chưa check-in mới có thể đánh dấu không đến");
        }

        LocalTime checkInTime = context.hotel().checkInTime() != null
                ? context.hotel().checkInTime()
                : LocalTime.of(14, 0);
        LocalDateTime graceDeadline = LocalDateTime.of(booking.getCheckIn(), checkInTime).plusHours(1);
        LocalDateTime now = LocalDateTime.now(HOTEL_TIME_ZONE);
        if (now.isBefore(graceDeadline)) {
            throw new IllegalStateException(
                    "Chưa qua thời gian chờ 1 giờ sau giờ nhận phòng. Chỉ đánh dấu NO_SHOW sau "
                            + graceDeadline.toLocalTime()
            );
        }

        booking.markNoShow();
        notificationClient.sendUser(
                booking.getCustomerId(),
                "Booking được ghi nhận không đến",
                "Booking " + booking.getBookingCode() + " tại " + context.hotel().name()
                        + " đã được ghi nhận NO_SHOW vì chưa check-in sau thời gian chờ. "
                        + "Nếu muốn yêu cầu hoàn tiền, bạn có thể gửi yêu cầu để khách sạn xem xét chính sách.",
                "BOOKING_NO_SHOW",
                "BOOKING",
                "/customer/bookings#booking-" + booking.getId()
        );
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

    private PricingService.LateCheckoutQuote refreshLateCheckoutFee(
            Booking booking,
            HotelClient.HotelDetails hotel,
            Instant now
    ) {
        LocalTime checkOutTime = hotel.checkOutTime() != null
                ? hotel.checkOutTime()
                : LocalTime.NOON;
        LocalDateTime expectedCheckOutAt = LocalDateTime.of(
                booking.getCheckOut(), checkOutTime
        );
        PricingService.LateCheckoutQuote quote = pricingService.lateCheckoutQuote(
                booking, expectedCheckOutAt, now
        );

        BigDecimal currentFee = booking.getLateCheckoutFee() == null
                ? BigDecimal.ZERO
                : booking.getLateCheckoutFee();
        BigDecimal targetFee = quote.estimatedFee().max(currentFee);

        // V2: booking đang CHECKED_IN phải luôn được reconcile tài chính với mức
        // late fee hiện tại. Không chỉ cập nhật cột late_checkout_fee mà còn bắt
        // buộc total_price, remaining_amount và payment_status đồng bộ lại.
        //
        // Điều này cũng sửa các booking cũ từng bị "khóa" ở 20.000đ:
        // ví dụ estimatedFee = 60.000đ, currentFee = 20.000đ -> targetFee = 60.000đ.
        // Nếu fee đã là 60.000đ nhưng total/remaining còn dữ liệu cũ, việc gọi lại
        // assessLateCheckoutFee vẫn tái tính total/remaining chính xác.
        if (targetFee.signum() > 0 || currentFee.signum() > 0) {
            booking.assessLateCheckoutFee(targetFee, now);
            bookingRepository.saveAndFlush(booking);
            return pricingService.lateCheckoutQuote(booking, expectedCheckOutAt, now);
        }

        return quote;
    }

    private CheckInDetailsResponse toCheckInDetails(OwnedBookingContext context) {
        Booking booking = context.booking();

        LocalTime checkInTime = context.hotel().checkInTime() != null
                ? context.hotel().checkInTime()
                : LocalTime.of(14, 0);
        LocalTime checkOutTime = context.hotel().checkOutTime() != null
                ? context.hotel().checkOutTime()
                : LocalTime.NOON;

        LocalDateTime expectedCheckInAt = LocalDateTime.of(
                booking.getCheckIn(), checkInTime
        );
        LocalDateTime expectedCheckOutAt = LocalDateTime.of(
                booking.getCheckOut(), checkOutTime
        );
        LocalDateTime now = LocalDateTime.now(HOTEL_TIME_ZONE);

        boolean dateValid = !now.isBefore(expectedCheckInAt)
                && now.isBefore(expectedCheckOutAt);
        boolean paymentComplete = booking.getPaymentStatus() == BookingPaymentStatus.PAID
                && booking.getRemainingAmount().signum() == 0;
        boolean identityVerified = booking.isIdentityVerified();
        boolean canCheckIn = booking.getStatus() == BookingStatus.CONFIRMED
                && dateValid
                && paymentComplete
                && identityVerified;

        String actionMessage;
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            actionMessage = "Booking đã bị hủy";
        } else if (booking.getStatus() == BookingStatus.CHECKED_IN) {
            actionMessage = "Khách đã nhận phòng";
        } else if (booking.getStatus() == BookingStatus.CHECKED_OUT) {
            actionMessage = "Booking đã hoàn tất trả phòng";
        } else if (booking.getStatus() == BookingStatus.NO_SHOW) {
            actionMessage = "Booking đã được đánh dấu không đến";
        } else if (now.isBefore(expectedCheckInAt)) {
            actionMessage = "Chưa đến thời gian nhận phòng";
        } else if (!now.isBefore(expectedCheckOutAt)) {
            actionMessage = "Booking đã hết thời gian lưu trú";
        } else if (!paymentComplete) {
            actionMessage = "Khách còn phải thanh toán "
                    + booking.getRemainingAmount().stripTrailingZeros().toPlainString()
                    + " ₫ trước khi nhận phòng";
        } else if (booking.getIdentityVerificationStatus() == CheckInIdentityStatus.FAILED) {
            actionMessage = "Xác minh giấy tờ chưa đạt. Vui lòng quét lại QR CCCD hoặc kiểm tra trực tiếp tại quầy.";
        } else if (!identityVerified) {
            actionMessage = "Cần xác minh giấy tờ người đại diện nhận phòng trước khi check-in";
        } else if (booking.getStatus() != BookingStatus.CONFIRMED) {
            actionMessage = "Booking chưa ở trạng thái sẵn sàng nhận phòng";
        } else if (now.toLocalDate().isAfter(booking.getCheckIn())) {
            actionMessage = "Khách đến nhận phòng trễ nhưng booking vẫn còn hiệu lực. Có thể tiếp tục nhận phòng";
        } else {
            actionMessage = "Booking, thanh toán và danh tính đều hợp lệ. Có thể nhận phòng";
        }

        String address = String.join(", ", List.of(
                safe(context.hotel().address()),
                safe(context.hotel().city())
        ).stream().filter(value -> !value.isBlank()).toList());

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

        CheckInIdentityVerificationResponse identityVerification =
                new CheckInIdentityVerificationResponse(
                        booking.getIdentityVerificationStatus().name(),
                        "BOOKER",
                        identitySubjectName(booking),
                        identityExpectedDateOfBirth(booking),
                        booking.getIdentityNameMatched(),
                        booking.getIdentityDateOfBirthMatched(),
                        booking.getIdentityAgeEligible(),
                        booking.getIdentityAgeAtCheckIn(),
                        booking.getIdentityNumberLast4(),
                        booking.getIdentityVerifiedAt(),
                        booking.getIdentityVerificationFailureReason(),
                        booking.getIdentityVerificationMethod()
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
                identityVerification,
                actionMessage
        );
    }

    private void validateCheckInDate(
            Booking booking,
            HotelClient.HotelDetails hotel
    ) {
        LocalTime checkInTime = hotel.checkInTime() != null
                ? hotel.checkInTime()
                : LocalTime.of(14, 0);
        LocalTime checkOutTime = hotel.checkOutTime() != null
                ? hotel.checkOutTime()
                : LocalTime.NOON;

        LocalDateTime expectedCheckInAt = LocalDateTime.of(
                booking.getCheckIn(), checkInTime
        );
        LocalDateTime expectedCheckOutAt = LocalDateTime.of(
                booking.getCheckOut(), checkOutTime
        );
        LocalDateTime now = LocalDateTime.now(HOTEL_TIME_ZONE);

        if (now.isBefore(expectedCheckInAt)) {
            throw new IllegalStateException("Chưa đến thời gian nhận phòng");
        }
        if (!now.isBefore(expectedCheckOutAt)) {
            throw new IllegalStateException("Booking đã hết thời gian lưu trú");
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


    private List<BigDecimal> allocateDiscount(BigDecimal totalDiscount, List<ResolvedRoom> rooms) {
        BigDecimal total = totalDiscount == null ? BigDecimal.ZERO : totalDiscount.setScale(2, RoundingMode.HALF_UP);
        if (rooms.isEmpty() || total.signum() == 0) {
            return rooms.stream().map(item -> BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)).toList();
        }
        BigDecimal gross = rooms.stream().map(item -> item.pricing().totalAmount()).reduce(BigDecimal.ZERO, BigDecimal::add);
        List<BigDecimal> result = new ArrayList<>();
        BigDecimal assigned = BigDecimal.ZERO;
        for (int i = 0; i < rooms.size(); i++) {
            BigDecimal share;
            if (i == rooms.size() - 1) {
                share = total.subtract(assigned);
            } else {
                share = total.multiply(rooms.get(i).pricing().totalAmount())
                        .divide(gross, 2, RoundingMode.HALF_UP);
                assigned = assigned.add(share);
            }
            result.add(share.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP));
        }
        return result;
    }

    private void validateBookerAge(CreateBookingBatchRequest request) {
        LocalDate dateOfBirth = request.bookerDateOfBirth();
        if (dateOfBirth == null) {
            throw new IllegalArgumentException(
                    "Vui lòng cập nhật ngày sinh của người đứng tên đặt phòng"
            );
        }

        LocalDate today = LocalDate.now(HOTEL_TIME_ZONE);
        if (dateOfBirth.isAfter(today)) {
            throw new IllegalArgumentException("Ngày sinh người đặt không hợp lệ");
        }
        if (Period.between(dateOfBirth, today).getYears() < 18) {
            throw new IllegalArgumentException(
                    "Người đứng tên đặt phòng phải từ đủ 18 tuổi trở lên"
            );
        }
        if (!request.ageConfirmed()) {
            throw new IllegalArgumentException(
                    "Bạn phải xác nhận điều kiện độ tuổi trước khi đặt phòng"
            );
        }
    }

    private void ensureIdentityVerified(Booking booking) {
        if (!booking.isIdentityVerified()) {
            throw new IllegalStateException(
                    "Chưa xác minh giấy tờ của người đại diện nhận phòng"
            );
        }
    }

    private String identitySubjectName(Booking booking) {
        // CCCD/Hộ chiếu luôn xác minh NGƯỜI ĐỨNG TÊN BOOKING.
        // Tên tài khoản Customer và tên khách lưu trú có thể khác, nên tuyệt đối
        // không dùng guest name/profile display name để đối chiếu giấy tờ.
        return String.join(" ", List.of(
                        safe(booking.getBookerLastName()),
                        safe(booking.getBookerFirstName())
                ))
                .trim()
                .replaceAll("\\s+", " ");
    }

    private LocalDate identityExpectedDateOfBirth(Booking booking) {
        // Ngày sinh phải là snapshot của NGƯỜI ĐỨNG TÊN BOOKING được nhập
        // tại checkout, không phụ thuộc người đó có trực tiếp lưu trú hay không.
        return booking.getBookerDateOfBirth();
    }

    private String normalizedPersonName(String value) {
        String prepared = safe(value)
                .replace('Đ', 'D')
                .replace('đ', 'd');
        return Normalizer.normalize(prepared, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9 ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
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