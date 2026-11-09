package com.smarthotel.ai;

import com.smarthotel.ai.assistant.v2.service.GroundedAssistantService;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.booking.BookingClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "security.jwt.secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
@AutoConfigureMockMvc
class LocalAssistantApplicationTest {
    @Autowired GroundedAssistantService assistant;
    @Autowired MockMvc http;
    @MockitoBean HotelClient hotels;
    @MockitoBean BookingClient bookings;

    @Test
    void startsWithNoExternalAiConfiguration() {
        assertThat(assistant).isNotNull();
    }

    @Test
    void authenticatedCustomerReceivesLocalAnswerWithoutFetchingData() throws Exception {
        http.perform(post("/api/ai/assistant").with(jwt().jwt(token -> token.subject("00000000-0000-0000-0000-000000000001"))
                        .authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER")))
                        .contentType("application/json").content("{\"message\":\"quen mat khau\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.model").value("enziuroom-local-v5"))
                .andExpect(jsonPath("$.engine.mode").value("LOCAL_RULES_AND_SYSTEM_DATA"))
                .andExpect(jsonPath("$.engine.externalModelUsed").value(false))
                .andExpect(jsonPath("$.answer").value(org.hamcrest.Matchers.containsString("Quên mật khẩu?")));
        verifyNoInteractions(hotels, bookings);
    }

    @Test
    void anonymousUserCannotReadAssistantBookingData() throws Exception {
        http.perform(post("/api/ai/assistant").contentType("application/json").content("{\"message\":\"Đơn của tôi\"}"))
                .andExpect(status().isUnauthorized());
    }
}
