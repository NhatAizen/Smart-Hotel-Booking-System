package com.smarthotel.gateway.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;
import io.netty.channel.ChannelOption;

import java.time.Duration;
import java.util.Locale;
import java.util.Optional;

public class CurrentRoleWebFilter implements WebFilter {

    private final WebClient identityClient;

    public CurrentRoleWebFilter(
            WebClient.Builder webClientBuilder,
            @Value("${IDENTITY_SERVICE_URL:http://localhost:8081}")
            String identityServiceUrl
    ) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 2000)
                .responseTimeout(Duration.ofSeconds(3));
        this.identityClient = webClientBuilder
                .baseUrl(identityServiceUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        return ReactiveSecurityContextHolder.getContext()
                .map(context -> context.getAuthentication())
                .filter(authentication ->
                        authentication instanceof JwtAuthenticationToken
                                && authentication.isAuthenticated()
                )
                .cast(JwtAuthenticationToken.class)
                .map(Optional::of)
                .defaultIfEmpty(Optional.empty())
                .flatMap(authentication -> authentication
                        .map(value -> validateCurrentRole(exchange, chain, value))
                        .orElseGet(() -> chain.filter(exchange))
                );
    }

    private Mono<Void> validateCurrentRole(
            ServerWebExchange exchange,
            WebFilterChain chain,
            JwtAuthenticationToken authentication
    ) {
        String tokenRole = normalize(authentication.getToken().getClaimAsString("role"));

        Mono<CurrentRoleResponse> roleLookup = identityClient.get()
                .uri("/api/users/me/role-snapshot")
                .headers(headers -> headers.setBearerAuth(
                        authentication.getToken().getTokenValue()
                ))
                .exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(CurrentRoleResponse.class);
                    }
                    if (response.statusCode().value() == 401
                            || response.statusCode().value() == 403) {
                        return Mono.just(new CurrentRoleResponse("", false));
                    }
                    return Mono.empty();
                })
                .onErrorResume(error -> Mono.empty());

        return roleLookup
                .map(Optional::of)
                .defaultIfEmpty(Optional.empty())
                .flatMap(snapshot -> {
                    if (snapshot.isEmpty()) {
                        return reject(exchange, HttpStatus.SERVICE_UNAVAILABLE);
                    }
                    CurrentRoleResponse currentRole = snapshot.get();
                    if (currentRole.active()
                            && tokenRole.equals(normalize(currentRole.role()))) {
                        return chain.filter(exchange);
                    }
                    return reject(exchange, HttpStatus.UNAUTHORIZED);
                });
    }

    private Mono<Void> reject(ServerWebExchange exchange, HttpStatus status) {
        exchange.getResponse().setStatusCode(status);
        return exchange.getResponse().setComplete();
    }

    private String normalize(String role) {
        return role == null
                ? ""
                : role.trim().replaceFirst("(?i)^ROLE_", "").toUpperCase(Locale.ROOT);
    }

    private record CurrentRoleResponse(String role, boolean active) {
    }
}
