package com.smarthotel.hotel.pricing.repository;

import com.smarthotel.hotel.pricing.entity.ManualDailyPriceRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface ManualDailyPriceRuleRepository extends JpaRepository<ManualDailyPriceRule, UUID> {
    List<ManualDailyPriceRule> findAllByHotelIdOrderByStartDateAscCreatedAtAsc(UUID hotelId);

    List<ManualDailyPriceRule>
    findAllByRoomTypeIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
            UUID roomTypeId, LocalDate endDate, LocalDate startDate);
}
