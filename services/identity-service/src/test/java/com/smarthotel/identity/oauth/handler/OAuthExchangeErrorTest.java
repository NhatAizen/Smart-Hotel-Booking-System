package com.smarthotel.identity.oauth.handler;

import com.smarthotel.identity.common.exception.GlobalExceptionHandler;
import com.smarthotel.identity.oauth.config.OAuth2Properties;
import com.smarthotel.identity.oauth.controller.OAuth2AuthController;
import com.smarthotel.identity.oauth.service.OAuth2AuthorizationCodeService;
import com.smarthotel.identity.security.JwtService;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.repository.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.mockito.Mockito.*;

class OAuthExchangeErrorTest {
    private final UserRepository users=mock(UserRepository.class);
    private final JwtService jwt=mock(JwtService.class);
    private final RefreshTokenService refresh=mock(RefreshTokenService.class);
    private final OAuth2AuthorizationCodeService codes=new OAuth2AuthorizationCodeService(new OAuth2Properties("https://enziurooms.xyz/oauth2/callback",120));
    private MockMvc mvc;
    @BeforeEach void setup() {
        mvc=MockMvcBuilders.standaloneSetup(new OAuth2AuthController(codes,users,jwt,refresh)).setControllerAdvice(new GlobalExceptionHandler()).build();
    }
    @Test void nonexistentOrExpiredCodeIsAClientErrorNotAnInternalServerFailure() throws Exception {
        mvc.perform(post("/api/auth/oauth2/exchange").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"invalid-test-code\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.message").value("Mã đăng nhập mạng xã hội không hợp lệ hoặc đã hết hạn"));
        verifyNoInteractions(users,jwt,refresh);
    }
    @Test void aCodeForAMissingAccountIsUnauthorizedAndIssuesNoTokens() throws Exception {
        String code=codes.issue(UUID.randomUUID());
        mvc.perform(post("/api/auth/oauth2/exchange").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\""+code+"\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        verifyNoInteractions(jwt,refresh);
    }
    @Test void serverFailuresKeepTheirStatusWithoutDisclosingInternalReasons() {
        var response=new GlobalExceptionHandler().handleResponseStatus(
                new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"internal-only-diagnostic"),
                new org.springframework.mock.web.MockHttpServletRequest());
        org.assertj.core.api.Assertions.assertThat(response.getStatusCode().value()).isEqualTo(503);
        org.assertj.core.api.Assertions.assertThat(response.getBody().message()).doesNotContain("internal-only-diagnostic");
    }
}
