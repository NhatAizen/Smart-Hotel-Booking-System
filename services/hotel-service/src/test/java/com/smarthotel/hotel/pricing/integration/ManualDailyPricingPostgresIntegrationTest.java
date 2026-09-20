package com.smarthotel.hotel.pricing.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.pricing.dto.ManualDailyPriceRuleInput;
import com.smarthotel.hotel.pricing.service.ManualDailyPriceRuleService;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Real Hotel Service rules and read endpoint against the disposable CI catalog. */
@EnabledIfEnvironmentVariable(named = "CI_DAILY_HOTEL_INTEGRATION", matches = "true")
@SpringBootTest(properties = "clients.nominatim.enabled=false")
@AutoConfigureMockMvc
class ManualDailyPricingPostgresIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired ManualDailyPriceRuleService rules;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockBean HotelService hotels;

    @BeforeAll
    static void requireDisposableDatabase() {
        assertThat(System.getenv("DB_URL"))
                .isEqualTo("jdbc:postgresql://localhost:5432/hotel_daily_ci");
        assertThat(System.getenv("DB_USERNAME")).isEqualTo("ci_daily");
    }

    @Test
    void approvedPriceBoundsAndImmediateCustomerVisibility() throws Exception {
        UUID hotelId = UUID.randomUUID();
        UUID typeId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        LocalDate date = LocalDate.now().plusDays(30);
        jdbc.update("""
                INSERT INTO hotels (id, owner_id, name, address, city)
                VALUES (?, ?, 'CI Synthetic Hotel', 'CI Street', 'CI City')
                """, hotelId, ownerId);
        jdbc.update("""
                INSERT INTO room_types (id, hotel_id, name, base_price, approved_base_price,
                    max_adults, approval_status)
                VALUES (?, ?, 'CI Suite', 900, 1000, 2, 'APPROVED')
                """, typeId, hotelId);

        assertThatThrownBy(() -> rules.create(ownerId, hotelId,
                new ManualDailyPriceRuleInput(typeId, date, date, new BigDecimal("499.99"))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> rules.create(ownerId, hotelId,
                new ManualDailyPriceRuleInput(typeId, date, date, new BigDecimal("1250.01"))))
                .isInstanceOf(IllegalArgumentException.class);
        rules.create(ownerId, hotelId,
                new ManualDailyPriceRuleInput(typeId, date, date, new BigDecimal("750.00")));

        var response = mvc.perform(get("/api/hotels/{hotelId}/room-types/{roomTypeId}/customer-daily-prices",
                        hotelId, typeId)
                        .param("checkIn", date.toString())
                        .param("checkOut", date.plusDays(1).toString()))
                .andExpect(status().isOk()).andReturn();
        var json = mapper.readTree(response.getResponse().getContentAsString());
        assertThat(json).hasSize(1);
        assertThat(json.get(0).get("stayDate").asText()).isEqualTo(date.toString());
        assertThat(json.get(0).get("nightlyPrice").decimalValue()).isEqualByComparingTo("750");
        assertThat(json.get(0).size()).isEqualTo(2);

        jdbc.update("UPDATE room_types SET approved_base_price = 500 WHERE id = ?", typeId);
        var invalidated = mvc.perform(get("/api/hotels/{hotelId}/room-types/{roomTypeId}/customer-daily-prices",
                        hotelId, typeId)
                        .param("checkIn", date.toString())
                        .param("checkOut", date.plusDays(1).toString()))
                .andExpect(status().isOk()).andReturn();
        assertThat(mapper.readTree(invalidated.getResponse().getContentAsString())).isEmpty();
    }
}
