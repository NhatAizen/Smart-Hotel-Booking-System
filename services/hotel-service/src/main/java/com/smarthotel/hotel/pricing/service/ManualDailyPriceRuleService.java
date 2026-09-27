package com.smarthotel.hotel.pricing.service;

import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.pricing.dto.ManualDailyPricePreviewResponse;
import com.smarthotel.hotel.pricing.dto.ManualDailyPriceRuleInput;
import com.smarthotel.hotel.pricing.dto.ManualDailyPriceRuleResponse;
import com.smarthotel.hotel.pricing.entity.ManualDailyPriceRule;
import com.smarthotel.hotel.pricing.repository.ManualDailyPriceRuleRepository;
import com.smarthotel.hotel.room.repository.RoomRepository;
import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class ManualDailyPriceRuleService {
    private static final int PREVIEW_PAGE_SIZE = 62;
    private static final BigDecimal MIN_FACTOR = new BigDecimal("0.50");
    private static final BigDecimal MAX_FACTOR = new BigDecimal("1.25");

    private final ManualDailyPriceRuleRepository rules;
    private final RoomTypeRepository roomTypes;
    private final RoomRepository rooms;
    private final HotelService hotels;

    public ManualDailyPriceRuleService(ManualDailyPriceRuleRepository rules,
                                       RoomTypeRepository roomTypes,
                                       RoomRepository rooms,
                                       HotelService hotels) {
        this.rules = rules;
        this.roomTypes = roomTypes;
        this.rooms = rooms;
        this.hotels = hotels;
    }

    @Transactional(readOnly = true)
    public List<ManualDailyPriceRuleResponse> list(UUID ownerId, UUID hotelId) {
        hotels.getOwnedHotel(hotelId, ownerId);
        return rules.findAllByHotelIdOrderByStartDateAscCreatedAtAsc(hotelId).stream()
                .map(rule -> {
                    var type = roomTypes.findById(rule.getRoomTypeId()).orElse(null);
                    return ManualDailyPriceRuleResponse.from(rule, type != null
                            && withinBounds(type.getApprovedBasePrice(), rule.getNightlyPrice()));
                }).toList();
    }

    @Transactional
    public ManualDailyPriceRuleResponse create(UUID ownerId, UUID hotelId, ManualDailyPriceRuleInput input) {
        hotels.getOwnedHotel(hotelId, ownerId);
        validateInput(input);
        RoomType type = ownedTypeForUpdate(hotelId, input.roomTypeId());
        validatePrice(type, input.nightlyPrice());
        ensureNoOverlap(type.getId(), input.startDate(), input.endDate(), null);
        var rule = new ManualDailyPriceRule(hotelId, type.getId(), input.startDate(),
                input.endDate(), input.nightlyPrice(), type.getApprovedBasePrice());
        return ManualDailyPriceRuleResponse.from(rules.save(rule), true);
    }

    @Transactional
    public ManualDailyPriceRuleResponse update(UUID ownerId, UUID hotelId, UUID ruleId,
                                               ManualDailyPriceRuleInput input) {
        hotels.getOwnedHotel(hotelId, ownerId);
        validateInput(input);
        var rule = ownedRule(hotelId, ruleId);
        if (!rule.getRoomTypeId().equals(input.roomTypeId())) {
            throw new IllegalArgumentException("Không thể đổi loại phòng của quy tắc; hãy xóa và tạo quy tắc mới");
        }
        RoomType type = ownedTypeForUpdate(hotelId, rule.getRoomTypeId());
        validatePrice(type, input.nightlyPrice());
        ensureNoOverlap(type.getId(), input.startDate(), input.endDate(), ruleId);
        rule.update(input.startDate(), input.endDate(), input.nightlyPrice(), type.getApprovedBasePrice());
        return ManualDailyPriceRuleResponse.from(rule, true);
    }

    @Transactional
    public void delete(UUID ownerId, UUID hotelId, UUID ruleId) {
        hotels.getOwnedHotel(hotelId, ownerId);
        var rule = ownedRule(hotelId, ruleId);
        ownedTypeForUpdate(hotelId, rule.getRoomTypeId());
        rules.delete(rule);
    }

    @Transactional(readOnly = true)
    public ManualDailyPricePreviewResponse preview(UUID ownerId, UUID hotelId,
                                                   ManualDailyPriceRuleInput input,
                                                   UUID editingRuleId, LocalDate pageStart) {
        hotels.getOwnedHotel(hotelId, ownerId);
        validateInput(input);
        RoomType type = ownedType(hotelId, input.roomTypeId());
        validatePrice(type, input.nightlyPrice());
        if (editingRuleId != null) {
            var edited = ownedRule(hotelId, editingRuleId);
            if (!edited.getRoomTypeId().equals(type.getId())) {
                throw new IllegalArgumentException("Quy tắc đang sửa thuộc loại phòng khác");
            }
        }
        LocalDate first = pageStart == null ? input.startDate() : pageStart;
        if (first.isBefore(input.startDate()) || first.isAfter(input.endDate())) {
            throw new IllegalArgumentException("Ngày bắt đầu trang xem trước nằm ngoài khoảng quy tắc");
        }
        var conflicts = overlapping(type.getId(), input.startDate(), input.endDate(), editingRuleId);
        var nights = new ArrayList<ManualDailyPricePreviewResponse.Night>();
        LocalDate date = first;
        for (int count = 0; count < PREVIEW_PAGE_SIZE && !date.isAfter(input.endDate()); count++) {
            LocalDate current = date;
            var conflict = conflicts.stream()
                    .filter(rule -> !current.isBefore(rule.getStartDate()) && !current.isAfter(rule.getEndDate()))
                    .findFirst().map(ManualDailyPriceRule::getId).orElse(null);
            nights.add(new ManualDailyPricePreviewResponse.Night(date, input.nightlyPrice(), conflict));
            date = date.plusDays(1);
        }
        LocalDate next = date.isAfter(input.endDate()) ? null : date;
        var customRooms = rooms.findAllByHotelIdAndRoomTypeIdOrderByRoomNumberAsc(hotelId, type.getId())
                .stream().filter(room -> room.getCustomPrice() != null)
                .map(room -> new ManualDailyPricePreviewResponse.CustomPriceRoom(
                        room.getId(), room.getRoomNumber(), room.getCustomPrice()))
                .toList();
        return new ManualDailyPricePreviewResponse(type.getId(), type.getName(),
                type.getApprovedBasePrice(), minimum(type.getApprovedBasePrice()),
                maximum(type.getApprovedBasePrice()), input.nightlyPrice(),
                ChronoUnit.DAYS.between(input.startDate(), input.endDate()) + 1,
                nights, next, customRooms, conflicts.stream().map(ManualDailyPriceRule::getId).toList(),
                conflicts.isEmpty(), true, false);
    }

    private ManualDailyPriceRule ownedRule(UUID hotelId, UUID id) {
        var rule = rules.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy quy tắc giá"));
        if (!rule.getHotelId().equals(hotelId)) {
            throw new IllegalArgumentException("Quy tắc giá không thuộc khách sạn này");
        }
        return rule;
    }

    private RoomType ownedType(UUID hotelId, UUID id) {
        var type = roomTypes.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy loại phòng"));
        if (!type.getHotelId().equals(hotelId)) {
            throw new IllegalArgumentException("Loại phòng không thuộc khách sạn này");
        }
        return type;
    }

    private RoomType ownedTypeForUpdate(UUID hotelId, UUID id) {
        var type = roomTypes.findForUpdate(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy loại phòng"));
        if (!type.getHotelId().equals(hotelId)) {
            throw new IllegalArgumentException("Loại phòng không thuộc khách sạn này");
        }
        return type;
    }

    private void validateInput(ManualDailyPriceRuleInput input) {
        if (input == null || input.roomTypeId() == null || input.startDate() == null
                || input.endDate() == null || input.nightlyPrice() == null) {
            throw new IllegalArgumentException("Cần nhập loại phòng, khoảng ngày và giá mỗi đêm");
        }
        if (input.startDate().isAfter(input.endDate())) {
            throw new IllegalArgumentException("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc");
        }
        if (input.nightlyPrice().signum() <= 0 || input.nightlyPrice().scale() > 2
                || input.nightlyPrice().precision() - input.nightlyPrice().scale() > 10) {
            throw new IllegalArgumentException("Giá mỗi đêm phải dương và có tối đa 2 chữ số thập phân");
        }
    }

    private void validatePrice(RoomType type, BigDecimal price) {
        var approved = type.getApprovedBasePrice();
        if (approved == null || approved.signum() <= 0) {
            throw new IllegalStateException("Loại phòng chưa có giá gốc đã được duyệt; không thể lưu giá theo ngày");
        }
        if (!withinBounds(approved, price)) {
            throw new IllegalArgumentException("Giá theo ngày phải từ " + minimum(approved)
                    + " đến " + maximum(approved) + " VND (50%–125% của giá gốc đã duyệt "
                    + approved + " VND)");
        }
    }

    private boolean withinBounds(BigDecimal approved, BigDecimal price) {
        return approved != null && approved.signum() > 0 && price != null
                && price.compareTo(approved.multiply(MIN_FACTOR)) >= 0
                && price.compareTo(approved.multiply(MAX_FACTOR)) <= 0;
    }

    private BigDecimal minimum(BigDecimal approved) {
        return approved.multiply(MIN_FACTOR).setScale(2, RoundingMode.CEILING);
    }

    private BigDecimal maximum(BigDecimal approved) {
        return approved.multiply(MAX_FACTOR).setScale(2, RoundingMode.FLOOR);
    }

    private List<ManualDailyPriceRule> overlapping(UUID typeId, LocalDate start, LocalDate end, UUID excludedId) {
        return rules.findAllByRoomTypeIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
                typeId, end, start).stream().filter(rule -> !Objects.equals(rule.getId(), excludedId)).toList();
    }

    private void ensureNoOverlap(UUID typeId, LocalDate start, LocalDate end, UUID excludedId) {
        if (!overlapping(typeId, start, end, excludedId).isEmpty()) {
            throw new IllegalArgumentException("Khoảng ngày đã chồng lấn với quy tắc giá của loại phòng này");
        }
    }
}
