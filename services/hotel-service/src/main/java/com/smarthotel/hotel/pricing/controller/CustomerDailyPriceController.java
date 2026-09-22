package com.smarthotel.hotel.pricing.controller;

import com.smarthotel.hotel.pricing.dto.CustomerDailyPriceResponse;
import com.smarthotel.hotel.pricing.repository.ManualDailyPriceRuleRepository;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/hotels/{hotelId}/room-types/{roomTypeId}/customer-daily-prices")
public class CustomerDailyPriceController {
    private static final BigDecimal MIN_FACTOR = new BigDecimal("0.50");
    private static final BigDecimal MAX_FACTOR = new BigDecimal("1.25");
    private final ManualDailyPriceRuleRepository rules;
    private final RoomTypeRepository roomTypes;

    public CustomerDailyPriceController(ManualDailyPriceRuleRepository rules, RoomTypeRepository roomTypes) {
        this.rules = rules;
        this.roomTypes = roomTypes;
    }

    @GetMapping
    public List<CustomerDailyPriceResponse> list(@PathVariable UUID hotelId,
                                                  @PathVariable UUID roomTypeId,
                                                  @RequestParam LocalDate checkIn,
                                                  @RequestParam LocalDate checkOut) {
        if (checkIn == null || checkOut == null || !checkOut.isAfter(checkIn)) {
            throw new IllegalArgumentException("Ngày trả phòng phải sau ngày nhận phòng");
        }
        var type = roomTypes.findById(roomTypeId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy loại phòng"));
        if (!hotelId.equals(type.getHotelId())) {
            throw new IllegalArgumentException("Loại phòng không thuộc khách sạn đã chọn");
        }
        BigDecimal approved = type.getApprovedBasePrice();
        if (approved == null || approved.signum() <= 0) return List.of();
        var result = new ArrayList<CustomerDailyPriceResponse>();
        for (var rule : rules.findAllByRoomTypeIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
                roomTypeId, checkOut.minusDays(1), checkIn)) {
            BigDecimal price = rule.getNightlyPrice();
            if (!hotelId.equals(rule.getHotelId())
                    || price.compareTo(approved.multiply(MIN_FACTOR)) < 0
                    || price.compareTo(approved.multiply(MAX_FACTOR)) > 0) continue;
            for (LocalDate date = rule.getStartDate().isAfter(checkIn) ? rule.getStartDate() : checkIn;
                 date.isBefore(checkOut) && !date.isAfter(rule.getEndDate()); date = date.plusDays(1)) {
                result.add(new CustomerDailyPriceResponse(date, price));
            }
        }
        return result;
    }
}
