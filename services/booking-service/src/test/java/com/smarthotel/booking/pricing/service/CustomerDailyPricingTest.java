package com.smarthotel.booking.pricing.service;

import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.pricing.entity.SpecialPricingDate;
import com.smarthotel.booking.pricing.repository.BookingNightPriceRepository;
import com.smarthotel.booking.pricing.repository.SpecialPricingDateRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CustomerDailyPricingTest {
    private final SpecialPricingDateRepository specialDates = mock(SpecialPricingDateRepository.class);
    private final BookingNightPriceRepository nightPrices = mock(BookingNightPriceRepository.class);
    private final HotelClient hotel = mock(HotelClient.class);
    private final UUID hotelId = UUID.randomUUID();
    private final UUID typeId = UUID.randomUUID();
    private final UUID roomId = UUID.randomUUID();
    private final LocalDate saturday = LocalDate.of(2026, 9, 26);

    private PricingService service(boolean enabled) {
        when(specialDates.findAllByPricingDateBetweenAndActiveTrue(any(), any())).thenReturn(List.of());
        return new PricingService(specialDates, nightPrices, hotel, enabled,
                BigDecimal.TEN, 60, new BigDecimal("30"), new BigDecimal("50"));
    }

    @Test
    void disabledKeepsCustomPriceAndWeekendSurchargeWithoutFetchingRules() {
        var price = service(false).calculateCustomerRoomPricing(roomId, typeId, "101", "Suite",
                new BigDecimal("900.00"), hotelId, saturday, saturday.plusDays(1));
        assertThat(price.totalAmount()).isEqualByComparingTo("990.00");
        assertThat(price.nights().get(0).pricingType()).isEqualTo("WEEKEND");
        verify(hotel, never()).getCustomerDailyPrices(any(), any(), any(), any());
    }

    @Test
    void enabledManualPriceReplacesCustomPriceAndWeekendSurchargeForCoveredNight() {
        var service = service(true);
        var special = mock(SpecialPricingDate.class);
        when(special.getPricingDate()).thenReturn(saturday);
        when(specialDates.findAllByPricingDateBetweenAndActiveTrue(saturday, saturday.plusDays(1)))
                .thenReturn(List.of(special));
        when(hotel.getCustomerDailyPrices(hotelId, typeId, saturday, saturday.plusDays(2)))
                .thenReturn(List.of(new HotelClient.CustomerDailyPrice(saturday, new BigDecimal("750.00"))));
        var price = service.calculateCustomerRoomPricing(roomId, typeId, "101", "Suite",
                new BigDecimal("900.00"), hotelId, saturday, saturday.plusDays(2));
        assertThat(price.totalAmount()).isEqualByComparingTo("1740.00");
        assertThat(price.nights()).extracting(n -> n.pricingType())
                .containsExactly("MANUAL_DAILY", "WEEKEND");
        assertThat(price.nights().get(0).surchargeAmount()).isEqualByComparingTo("0");
    }
}
