package com.smarthotel.identity.oauth.handler;

import com.smarthotel.identity.oauth.config.OAuth2Properties;
import com.smarthotel.identity.oauth.service.OAuth2AuthorizationCodeService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.util.Locale;

@Component
public class OAuth2AuthenticationSuccessHandler
        implements AuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final OAuth2AuthorizationCodeService codeService;
    private final OAuth2Properties properties;

    public OAuth2AuthenticationSuccessHandler(
            UserRepository userRepository,
            OAuth2AuthorizationCodeService codeService,
            OAuth2Properties properties
    ) {
        this.userRepository = userRepository;
        this.codeService = codeService;
        this.properties = properties;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException {

        String email = extractEmail(
                authentication.getPrincipal()
        );

        if (email == null || email.isBlank()) {
            redirectWithError(
                    request,
                    response,
                    "oauth_email_not_found"
            );
            return;
        }

        User user = userRepository
                .findByEmailIgnoreCase(email)
                .orElse(null);

        if (
                user == null
                        || !user.isActive()
        ) {
            redirectWithError(
                    request,
                    response,
                    "account_not_available"
            );
            return;
        }

        String code = codeService.issue(
                user.getId()
        );

        clearOAuthSession(request);

        String redirectUrl =
                UriComponentsBuilder
                        .fromUriString(
                                properties.frontendCallbackUrl()
                        )
                        .queryParam(
                                "code",
                                code
                        )
                        .build()
                        .encode()
                        .toUriString();

        response.sendRedirect(redirectUrl);
    }

    private String extractEmail(
            Object principal
    ) {
        String email = null;

        /*
         * Google.
         */
        if (principal instanceof OidcUser oidcUser) {
            email = oidcUser.getEmail();
        }

        /*
         * Facebook.
         */
        else if (
                principal
                        instanceof OAuth2User oauth2User
        ) {
            Object emailAttribute =
                    oauth2User.getAttribute(
                            "email"
                    );

            if (emailAttribute != null) {
                email =
                        emailAttribute.toString();
            }
        }

        if (
                email == null
                        || email.isBlank()
        ) {
            return null;
        }

        return email
                .trim()
                .toLowerCase(Locale.ROOT);
    }

    private void redirectWithError(
            HttpServletRequest request,
            HttpServletResponse response,
            String error
    ) throws IOException {

        clearOAuthSession(request);

        String redirectUrl =
                UriComponentsBuilder
                        .fromUriString(
                                properties.frontendCallbackUrl()
                        )
                        .queryParam(
                                "error",
                                error
                        )
                        .build()
                        .encode()
                        .toUriString();

        response.sendRedirect(redirectUrl);
    }

    private void clearOAuthSession(
            HttpServletRequest request
    ) {
        SecurityContextHolder.clearContext();

        HttpSession session =
                request.getSession(false);

        if (session != null) {
            session.invalidate();
        }
    }
}