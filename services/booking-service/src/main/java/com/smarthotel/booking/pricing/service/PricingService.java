package com.smarthotel.booking.pricing.service;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.pricing.dto.*;
import com.smarthotel.booking.pricing.entity.BookingNightPrice;
import com.smarthotel.booking.pricing.entity.SpecialPricingDate;
import com.smarthotel.booking.pricing.repository.BookingNightPriceRepository;
import com.smarthotel.booking.pricing.repository.SpecialPricingDateRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

@Service
public class PricingService {
    private static final ZoneId HOTEL_TIME_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final SpecialPricingDateRepository specialDateRepository;
    private final BookingNightPriceRepository nightPriceRepository;
    private final HotelClient hotelClient;
    private final BigDecimal weekendSurchargePercent;
    private final int lateGraceMinutes;
    private final BigDecimal lateUpTo3HoursPercent;
    private final BigDecimal lateUpTo6HoursPercent;

    public PricingService(
            SpecialPricingDateRepository specialDateRepository,
            BookingNightPriceRepository nightPriceRepository,
            HotelClient hotelClient,
            @Value("${pricing.weekend-surcharge-percent:10}") BigDecimal weekendSurchargePercent,
            @Value("${pricing.late-checkout.grace-minutes:60}") int lateGraceMinutes,
            @Value("${pricing.late-checkout.up-to-3-hours-percent:30}") BigDecimal lateUpTo3HoursPercent,
            @Value("${pricing.late-checkout.up-to-6-hours-percent:50}") BigDecimal lateUpTo6HoursPercent
    ) {
        this.specialDateRepository = specialDateRepository;
        this.nightPriceRepository = nightPriceRepository;
        this.hotelClient = hotelClient;
        this.weekendSurchargePercent = validatePercent(weekendSurchargePercent, "weekend");
        this.lateGraceMinutes = Math.max(0, lateGraceMinutes);
        this.lateUpTo3HoursPercent = validatePercent(lateUpTo3HoursPercent, "late 3h");
        this.lateUpTo6HoursPercent = validatePercent(lateUpTo6HoursPercent, "late 6h");
    }

    @Transactional(readOnly = true)
    public PricingQuoteResponse quote(PricingQuoteRequest request) {
        validateRange(request.checkIn(), request.checkOut());
        List<UUID> roomIds = request.roomIds().stream().filter(Objects::nonNull).distinct().toList();
        if (roomIds.size() != request.roomIds().size()) {
            throw new IllegalArgumentException("Danh sách phòng có dữ liệu trùng lặp");
        }

        List<RoomPricingQuoteResponse> rooms = new ArrayList<>();
        for (UUID roomId : roomIds) {
            HotelClient.RoomDetails room = hotelClient.getRoom(roomId);
            if (!request.hotelId().equals(room.hotelId())) {
                throw new IllegalArgumentException("Phòng không thuộc khách sạn đã chọn");
            }
            HotelClient.RoomTypeDetails roomType = hotelClient.getRoomType(room.roomTypeId());
            BigDecimal baseNightlyPrice = room.customPrice() != null
                    ? room.customPrice() : roomType.basePrice();
            RoomPricing calculated = calculateRoomPricing(
                    room.id(), room.roomTypeId(), room.roomNumber(), roomType.name(),
                    baseNightlyPrice, request.checkIn(), request.checkOut()
            );
            rooms.add(calculated.toResponse());
        }

        return aggregate(request.hotelId(), request.checkIn(), request.checkOut(), rooms);
    }

    @Transactional(readOnly = true)
    public RoomPricing calculateRoomPricing(
            UUID roomId,
            UUID roomTypeId,
            String roomNumber,
            String roomTypeName,
            BigDecimal baseNightlyPrice,
            LocalDate checkIn,
            LocalDate checkOut
    ) {
        validateRange(checkIn, checkOut);
        BigDecimal normalizedBase = money(baseNightlyPrice);
        Map<LocalDate, SpecialPricingDate> specialDates = new HashMap<>();
        specialDateRepository.findAllByPricingDateBetweenAndActiveTrue(
                checkIn, checkOut.minusDays(1)
        ).forEach(item -> specialDates.put(item.getPricingDate(), item));

        List<NightlyPriceResponse> nights = new ArrayList<>();
        BigDecimal baseAmount = BigDecimal.ZERO;
        BigDecimal weekendAmount = BigDecimal.ZERO;
        BigDecimal specialAmount = BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;

        for (LocalDate date = checkIn; date.isBefore(checkOut); date = date.plusDays(1)) {
            SpecialPricingDate special = specialDates.get(date);
            String type = "WEEKDAY";
            String label = "Giá ngày thường";
            BigDecimal percent = BigDecimal.ZERO;

            if (special != null) {
                type = "SPECIAL_DATE";
                label = special.getName();
                percent = special.getSurchargePercent();
            } else if (date.getDayOfWeek() == DayOfWeek.SATURDAY
                    || date.getDayOfWeek() == DayOfWeek.SUNDAY) {
                type = "WEEKEND";
                label = "Cuối tuần +" + weekendSurchargePercent.stripTrailingZeros().toPlainString() + "%";
                percent = weekendSurchargePercent;
            }

            BigDecimal surcharge = percentAmount(normalizedBase, percent);
            BigDecimal finalPrice = money(normalizedBase.add(surcharge));
            baseAmount = baseAmount.add(normalizedBase);
            if ("WEEKEND".equals(type)) weekendAmount = weekendAmount.add(surcharge);
            if ("SPECIAL_DATE".equals(type)) specialAmount = specialAmount.add(surcharge);
            total = total.add(finalPrice);
            nights.add(new NightlyPriceResponse(
                    date, normalizedBase, type, label, money(percent),
                    surcharge, finalPrice
            ));
        }

        return new RoomPricing(
                roomId, roomTypeId, roomNumber, roomTypeName,
                money(baseAmount), money(weekendAmount), money(specialAmount),
                money(total), List.copyOf(nights)
        );
    }

    @Transactional
    public void saveNightlySnapshot(UUID bookingId, RoomPricing pricing) {
        List<BookingNightPrice> entities = pricing.nights().stream()
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
        nightPriceRepository.saveAll(entities);
    }

    @Transactional(readOnly = true)
    public LateCheckoutQuote lateCheckoutQuote(
            Booking booking,
            LocalDateTime expectedCheckOutAt,
            Instant now
    ) {
        Instant expected = expectedCheckOutAt.atZone(HOTEL_TIME_ZONE).toInstant();
        long overdueMinutes = Math.max(0, Duration.between(expected, now).toMinutes());
        BigDecimal referenceNightPrice = referenceNightPrice(booking);
        BigDecimal estimatedFee = BigDecimal.ZERO;
        BigDecimal percent = BigDecimal.ZERO;
        int chargedNights = 0;
        String label;

        if (overdueMinutes <= lateGraceMinutes) {
            label = overdueMinutes > 0
                    ? "Trong thời gian miễn phí " + lateGraceMinutes + " phút"
                    : "Chưa quá giờ trả phòng";
        } else if (overdueMinutes <= 180) {
            percent = lateUpTo3HoursPercent;
            estimatedFee = percentAmount(referenceNightPrice, percent);
            label = "Trễ trên 1 đến 3 giờ: thu " + pct(percent) + "% giá 1 đêm";
        } else if (overdueMinutes <= 360) {
            percent = lateUpTo6HoursPercent;
            estimatedFee = percentAmount(referenceNightPrice, percent);
            label = "Trễ trên 3 đến 6 giờ: thu " + pct(percent) + "% giá 1 đêm";
        } else {
            chargedNights = (int) Math.max(1, Math.ceil(overdueMinutes / 1440.0));
            percent = BigDecimal.valueOf(100L * chargedNights);
            estimatedFee = money(referenceNightPrice.multiply(BigDecimal.valueOf(chargedNights)));
            label = chargedNights == 1
                    ? "Trễ trên 6 giờ: thu thêm 1 đêm"
                    : "Trễ " + chargedNights + " chu kỳ 24 giờ: thu thêm " + chargedNights + " đêm";
        }

        BigDecimal assessed = booking.getLateCheckoutFee() == null
                ? BigDecimal.ZERO : booking.getLateCheckoutFee();
        boolean assessedFlag = booking.getLateFeeAssessedAt() != null;
        BigDecimal effectiveFee = assessedFlag ? assessed : estimatedFee;
        return new LateCheckoutQuote(
                overdueMinutes > 0,
                overdueMinutes,
                lateGraceMinutes,
                assessedFlag,
                booking.getLateFeeAssessedAt(),
                money(assessed),
                money(estimatedFee),
                money(percent),
                chargedNights,
                label,
                money(referenceNightPrice),
                money(effectiveFee)
        );
    }

    private BigDecimal referenceNightPrice(Booking booking) {
        List<BookingNightPrice> snapshots = nightPriceRepository
                .findAllByBookingIdOrderByStayDateAsc(booking.getId());
        if (!snapshots.isEmpty()) {
            return money(snapshots.get(snapshots.size() - 1).getFinalPrice());
        }

        long nights = Math.max(1, java.time.temporal.ChronoUnit.DAYS.between(
                booking.getCheckIn(), booking.getCheckOut()
        ));
        BigDecimal accommodation;
        if (booking.getBaseAccommodationAmount() != null) {
            accommodation = booking.getBaseAccommodationAmount()
                    .add(booking.getWeekendSurchargeAmount() == null
                            ? BigDecimal.ZERO : booking.getWeekendSurchargeAmount())
                    .add(booking.getSpecialDateSurchargeAmount() == null
                            ? BigDecimal.ZERO : booking.getSpecialDateSurchargeAmount());
        } else {
            accommodation = booking.getTotalPrice().subtract(
                    booking.getLateCheckoutFee() == null
                            ? BigDecimal.ZERO : booking.getLateCheckoutFee()
            );
        }
        return money(accommodation.divide(BigDecimal.valueOf(nights), 2, RoundingMode.HALF_UP));
    }

    private PricingQuoteResponse aggregate(
            UUID hotelId,
            LocalDate checkIn,
            LocalDate checkOut,
            List<RoomPricingQuoteResponse> rooms
    ) {
        BigDecimal base = rooms.stream().map(RoomPricingQuoteResponse::baseAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal weekend = rooms.stream().map(RoomPricingQuoteResponse::weekendSurchargeAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal special = rooms.stream().map(RoomPricingQuoteResponse::specialDateSurchargeAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal total = rooms.stream().map(RoomPricingQuoteResponse::totalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new PricingQuoteResponse(
                hotelId, checkIn, checkOut,
                java.time.temporal.ChronoUnit.DAYS.between(checkIn, checkOut),
                money(base), money(weekend), money(special), money(total), List.copyOf(rooms)
        );
    }

    private void validateRange(LocalDate checkIn, LocalDate checkOut) {
        if (checkIn == null || checkOut == null || !checkOut.isAfter(checkIn)) {
            throw new IllegalArgumentException("Ngày trả phòng phải sau ngày nhận phòng");
        }
    }

    private static BigDecimal validatePercent(BigDecimal value, String name) {
        if (value == null || value.signum() < 0 || value.compareTo(BigDecimal.valueOf(500)) > 0) {
            throw new IllegalArgumentException("Tỷ lệ " + name + " không hợp lệ");
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal percentAmount(BigDecimal base, BigDecimal percent) {
        return money(base.multiply(percent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
    }

    private static String pct(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static BigDecimal money(BigDecimal value) {
        if (value == null) return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    public record RoomPricing(
            UUID roomId,
            UUID roomTypeId,
            String roomNumber,
            String roomTypeName,
            BigDecimal baseAmount,
            BigDecimal weekendSurchargeAmount,
            BigDecimal specialDateSurchargeAmount,
            BigDecimal totalAmount,
            List<NightlyPriceResponse> nights
    ) {
        public RoomPricingQuoteResponse toResponse() {
            return new RoomPricingQuoteResponse(
                    roomId, roomTypeId, roomNumber, roomTypeName,
                    baseAmount, weekendSurchargeAmount, specialDateSurchargeAmount,
                    totalAmount, nights
            );
        }
    }

    public record LateCheckoutQuote(
            boolean overdue,
            long overdueMinutes,
            int graceMinutes,
            boolean feeAssessed,
            Instant feeAssessedAt,
            BigDecimal assessedFee,
            BigDecimal estimatedFee,
            BigDecimal feePercent,
            int chargedNights,
            String policyLabel,
            BigDecimal referenceNightPrice,
            BigDecimal effectiveFee
    ) {}
}
