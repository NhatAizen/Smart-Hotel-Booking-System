package com.smarthotel.hotel.pricing.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.hotel.pricing.entity.ManualDailyPriceRule;
import com.smarthotel.hotel.pricing.repository.ManualDailyPriceRuleRepository;
import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class CustomerDailyPriceControllerTest {
    @Test
    void onlyRulesWithinCurrentApprovedBoundsApplyImmediately() throws Exception {
        var rules = mock(ManualDailyPriceRuleRepository.class);
        var types = mock(RoomTypeRepository.class);
        var type = mock(RoomType.class);
        UUID hotel = UUID.randomUUID();
        UUID typeId = UUID.randomUUID();
        LocalDate start = LocalDate.of(2026, 9, 26);
        when(types.findById(typeId)).thenReturn(Optional.of(type));
        when(type.getHotelId()).thenReturn(hotel);
        when(type.getApprovedBasePrice()).thenReturn(new BigDecimal("1000.00"));
        when(rules.findAllByRoomTypeIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
                typeId, start.plusDays(2), start)).thenReturn(List.of(
                new ManualDailyPriceRule(hotel, typeId, start, start,
                        new BigDecimal("500.00"), new BigDecimal("1000.00")),
                new ManualDailyPriceRule(hotel, typeId, start.plusDays(1), start.plusDays(1),
                        new BigDecimal("1250.00"), new BigDecimal("1000.00")),
                new ManualDailyPriceRule(hotel, typeId, start.plusDays(2), start.plusDays(2),
                        new BigDecimal("1260.00"), new BigDecimal("1000.00"))));
        var prices = new CustomerDailyPriceController(rules, types)
                .list(hotel, typeId, start, start.plusDays(3));
        assertThat(prices).hasSize(2);
        assertThat(prices.get(0).nightlyPrice()).isEqualByComparingTo("500");
        assertThat(prices.get(1).nightlyPrice()).isEqualByComparingTo("1250");
        var mapper = new ObjectMapper().findAndRegisterModules();
        var customerFields = mapper.readTree(mapper.writeValueAsString(prices)).get(0);
        assertThat(customerFields.size()).isEqualTo(2);
        assertThat(customerFields.has("stayDate")).isTrue();
        assertThat(customerFields.has("nightlyPrice")).isTrue();
    }
}
