package com.smarthotel.booking.pricing.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.pricing.dto.PricingQuoteRequest;
import com.smarthotel.booking.pricing.entity.SpecialPricingDate;
import com.smarthotel.booking.pricing.repository.BookingNightPriceRepository;
import com.smarthotel.booking.pricing.repository.SpecialPricingDateRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
    void disabledQuoteKeepsLegacyPayloadAndNeverFetchesDailyPrices() throws Exception {
        when(hotel.getRoom(roomId)).thenReturn(new HotelClient.RoomDetails(
                roomId, hotelId, typeId, "101", 1, "AVAILABLE", new BigDecimal("900"), null));
        when(hotel.getRoomType(typeId)).thenReturn(new HotelClient.RoomTypeDetails(typeId, hotelId,
                "Suite", null, new BigDecimal("1000"), 2, 1, "KING", 1, null,
                false, true, false, true, true, 30, true));
        var quote = service(false).quote(new PricingQuoteRequest(hotelId, List.of(roomId),
                saturday, saturday.plusDays(1)));
        assertThat(quote.totalAmount()).isEqualByComparingTo("990");
        var mapper = new ObjectMapper().findAndRegisterModules();
        assertThat(mapper.readTree(mapper.writeValueAsString(quote))
                .has("pricingFingerprint")).isFalse();
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

    @Test
    void quoteAndBookingCalculationAgreeForMultipleRooms() {
        UUID secondRoom = UUID.randomUUID();
        when(hotel.getRoom(roomId)).thenReturn(new HotelClient.RoomDetails(
                roomId, hotelId, typeId, "101", 1, "AVAILABLE", new BigDecimal("900"), null));
        when(hotel.getRoom(secondRoom)).thenReturn(new HotelClient.RoomDetails(
                secondRoom, hotelId, typeId, "102", 1, "AVAILABLE", new BigDecimal("800"), null));
        when(hotel.getRoomType(typeId)).thenReturn(new HotelClient.RoomTypeDetails(typeId, hotelId,
                "Suite", null, new BigDecimal("1000"), 2, 1, "KING", 1, null,
                false, true, false, true, true, 30, true));
        when(hotel.getCustomerDailyPrices(hotelId, typeId, saturday, saturday.plusDays(1)))
                .thenReturn(List.of(new HotelClient.CustomerDailyPrice(saturday, new BigDecimal("750"))));
        var service = service(true);
        var quote = service.quote(new PricingQuoteRequest(hotelId, List.of(roomId, secondRoom),
                saturday, saturday.plusDays(1)));
        var first = service.calculateCustomerRoomPricing(roomId, typeId, "101", "Suite",
                new BigDecimal("900"), hotelId, saturday, saturday.plusDays(1));
        var second = service.calculateCustomerRoomPricing(secondRoom, typeId, "102", "Suite",
                new BigDecimal("800"), hotelId, saturday, saturday.plusDays(1));
        assertThat(quote.totalAmount()).isEqualByComparingTo("1500");
        assertThat(quote.rooms()).extracting(room -> room.totalAmount())
                .containsExactly(first.totalAmount(), second.totalAmount());
        assertThat(quote.pricingFingerprint()).isEqualTo(PricingService.fingerprint(List.of(first, second)));
    }

    @Test
    void sameGrandTotalWithChangedRoomNightPricesHasDifferentFingerprint() {
        var first = service(false).calculateRoomPricing(roomId, typeId, "101", "Suite",
                new BigDecimal("900"), saturday, saturday.plusDays(1));
        UUID secondRoom = UUID.randomUUID();
        var second = service(false).calculateRoomPricing(secondRoom, typeId, "102", "Suite",
                new BigDecimal("800"), saturday, saturday.plusDays(1));
        var changedFirst = service(false).calculateRoomPricing(roomId, typeId, "101", "Suite",
                new BigDecimal("800"), saturday, saturday.plusDays(1));
        var changedSecond = service(false).calculateRoomPricing(secondRoom, typeId, "102", "Suite",
                new BigDecimal("900"), saturday, saturday.plusDays(1));
        assertThat(first.totalAmount().add(second.totalAmount()))
                .isEqualByComparingTo(changedFirst.totalAmount().add(changedSecond.totalAmount()));
        assertThat(PricingService.fingerprint(List.of(first, second)))
                .isNotEqualTo(PricingService.fingerprint(List.of(changedFirst, changedSecond)));
    }

    @Test
    void unavailableOrInvalidHotelPricesFailClosed() {
        var service = service(true);
        when(hotel.getCustomerDailyPrices(hotelId, typeId, saturday, saturday.plusDays(1)))
                .thenThrow(new IllegalStateException("Hotel Service unavailable"))
                .thenReturn(List.of(new HotelClient.CustomerDailyPrice(saturday.minusDays(1),
                        new BigDecimal("750"))))
                .thenReturn(List.of(new HotelClient.CustomerDailyPrice(saturday,
                        new BigDecimal("750.123"))));
        assertThatThrownBy(() -> service.calculateCustomerRoomPricing(roomId, typeId, "101", "Suite",
                new BigDecimal("900"), hotelId, saturday, saturday.plusDays(1)))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.calculateCustomerRoomPricing(roomId, typeId, "101", "Suite",
                new BigDecimal("900"), hotelId, saturday, saturday.plusDays(1)))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.calculateCustomerRoomPricing(roomId, typeId, "101", "Suite",
                new BigDecimal("900"), hotelId, saturday, saturday.plusDays(1)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void legacyMethodIgnoresDailyRulesEvenWhenFlagEnabled() {
        var price = service(true).calculateRoomPricing(roomId, typeId, "101", "Suite",
                new BigDecimal("900"), saturday, saturday.plusDays(1));
        assertThat(price.totalAmount()).isEqualByComparingTo("990");
        verify(hotel, never()).getCustomerDailyPrices(any(), any(), any(), any());
    }
}
