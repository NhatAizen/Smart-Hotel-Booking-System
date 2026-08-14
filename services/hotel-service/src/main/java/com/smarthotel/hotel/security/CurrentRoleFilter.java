package com.smarthotel.hotel.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Locale;

public class CurrentRoleFilter extends OncePerRequestFilter {

    private final RestClient identityClient;

    public CurrentRoleFilter(
            RestClient.Builder restClientBuilder,
            String identityServiceUrl
    ) {
        this(configure(restClientBuilder), identityServiceUrl, true);
    }

    CurrentRoleFilter(
            RestClient.Builder restClientBuilder,
            String identityServiceUrl,
            boolean requestFactoryAlreadyConfigured
    ) {
        this.identityClient = restClientBuilder
                .baseUrl(identityServiceUrl)
                .build();
    }

    private static RestClient.Builder configure(RestClient.Builder builder) {
        SimpleClientHttpRequestFactory requestFactory =
                new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(2));
        requestFactory.setReadTimeout(Duration.ofSeconds(3));
        return builder.requestFactory(requestFactory);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder
                .getContext()
                .getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuthentication)
                || !authentication.isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            CurrentRoleResponse snapshot = identityClient.get()
                    .uri("/api/users/me/role-snapshot")
                    .header(
                            HttpHeaders.AUTHORIZATION,
                            "Bearer " + jwtAuthentication.getToken().getTokenValue()
                    )
                    .retrieve()
                    .body(CurrentRoleResponse.class);
            String tokenRole = normalize(
                    jwtAuthentication.getToken().getClaimAsString("role")
            );
            if (snapshot == null
                    || !snapshot.active()
                    || !tokenRole.equals(normalize(snapshot.role()))) {
                response.sendError(HttpStatus.UNAUTHORIZED.value());
                return;
            }
            filterChain.doFilter(request, response);
        } catch (HttpClientErrorException.Unauthorized
                 | HttpClientErrorException.Forbidden exception) {
            response.sendError(HttpStatus.UNAUTHORIZED.value());
        } catch (RestClientException exception) {
            response.sendError(HttpStatus.SERVICE_UNAVAILABLE.value());
        }
    }

    private String normalize(String role) {
        return role == null
                ? ""
                : role.trim().replaceFirst("(?i)^ROLE_", "")
                .toUpperCase(Locale.ROOT);
    }

    public record CurrentRoleResponse(String role, boolean active) {
    }
}
