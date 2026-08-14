package com.smarthotel.identity.oauth.handler;

import com.smarthotel.identity.oauth.config.OAuth2Properties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component
public class OAuth2AuthenticationFailureHandler
        implements AuthenticationFailureHandler {

    private final OAuth2Properties properties;

    public OAuth2AuthenticationFailureHandler(OAuth2Properties properties) {
        this.properties = properties;
    }

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception
    ) throws IOException {
        SecurityContextHolder.clearContext();

        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }

        String redirectUrl = UriComponentsBuilder
                .fromUriString(properties.frontendCallbackUrl())
                .queryParam("error", "google_login_failed")
                .build()
                .encode()
                .toUriString();

        response.sendRedirect(redirectUrl);
    }
}
