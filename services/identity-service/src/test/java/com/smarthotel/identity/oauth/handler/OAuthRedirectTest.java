package com.smarthotel.identity.oauth.handler;

import com.smarthotel.identity.oauth.config.OAuth2Properties;
import com.smarthotel.identity.oauth.service.OAuth2AuthorizationCodeService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import java.net.URI;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OAuthRedirectTest {
    private final OAuth2Properties properties=new OAuth2Properties("https://enziurooms.xyz/oauth2/callback",120);
    @Test
    void successfulGoogleLoginReturnsOnlyAOneTimeCodeToThePublicFrontend() throws Exception {
        var repository=mock(UserRepository.class);
        var codes=mock(OAuth2AuthorizationCodeService.class);
        var user=mock(User.class);
        UUID id=UUID.randomUUID();
        when(user.getId()).thenReturn(id); when(user.isActive()).thenReturn(true);
        when(repository.findByEmailIgnoreCase("test@example.invalid")).thenReturn(Optional.of(user));
        when(codes.issue(id)).thenReturn("test-one-time-code");
        var principal=mock(OidcUser.class); when(principal.getEmail()).thenReturn("test@example.invalid");
        var authentication=mock(Authentication.class); when(authentication.getPrincipal()).thenReturn(principal);
        var request=new MockHttpServletRequest(); request.getSession();
        var response=new MockHttpServletResponse();
        new OAuth2AuthenticationSuccessHandler(repository,codes,properties).onAuthenticationSuccess(request,response,authentication);
        URI redirect=URI.create(response.getRedirectedUrl());
        assertThat(redirect.getScheme()).isEqualTo("https");
        assertThat(redirect.getHost()).isEqualTo("enziurooms.xyz");
        assertThat(redirect.getPath()).isEqualTo("/oauth2/callback");
        assertThat(redirect.getQuery()).isEqualTo("code=test-one-time-code");
        assertThat(response.getRedirectedUrl()).doesNotContain("localhost","token=");
    }
    @Test
    void providerFailureAlsoReturnsToThePublicFrontend() throws Exception {
        var response=new MockHttpServletResponse();
        new OAuth2AuthenticationFailureHandler(properties).onAuthenticationFailure(new MockHttpServletRequest(),response,
                new OAuth2AuthenticationException(new OAuth2Error("access_denied")));
        assertThat(response.getRedirectedUrl()).isEqualTo("https://enziurooms.xyz/oauth2/callback?error=google_login_failed");
    }
    @Test
    void anUnavailableAccountReturnsAnErrorAndNeverIssuesALoginCode() throws Exception {
        var repository=mock(UserRepository.class); var codes=mock(OAuth2AuthorizationCodeService.class);
        var principal=mock(OidcUser.class); when(principal.getEmail()).thenReturn("test@example.invalid");
        var authentication=mock(Authentication.class); when(authentication.getPrincipal()).thenReturn(principal);
        var response=new MockHttpServletResponse();
        new OAuth2AuthenticationSuccessHandler(repository,codes,properties).onAuthenticationSuccess(new MockHttpServletRequest(),response,authentication);
        assertThat(response.getRedirectedUrl()).isEqualTo("https://enziurooms.xyz/oauth2/callback?error=account_not_available");
        verifyNoInteractions(codes);
    }
}
