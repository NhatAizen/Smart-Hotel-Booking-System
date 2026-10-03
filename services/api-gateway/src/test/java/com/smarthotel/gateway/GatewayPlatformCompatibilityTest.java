package com.smarthotel.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureObservability
class GatewayPlatformCompatibilityTest {
    private static final byte[] KEY = new byte[32];
    private static final Map<String, HttpServer> SERVERS = new LinkedHashMap<>();
    private static final AtomicBoolean STALE_ROLE = new AtomicBoolean();
    static { new SecureRandom().nextBytes(KEY); }

    @LocalServerPort int port;

    @DynamicPropertySource
    static void isolatedUpstreams(DynamicPropertyRegistry registry) throws Exception {
        registry.add("app.jwt.secret", () -> Base64.getEncoder().encodeToString(KEY));
        for (String service : List.of("identity", "booking", "hotel", "payment", "notification", "chat", "ai")) {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                String body = service;
                if (exchange.getRequestURI().getPath().equals("/api/users/me/role-snapshot")) {
                    String token = exchange.getRequestHeaders().getFirst("Authorization").substring(7);
                    var claims = new ObjectMapper().readTree(Base64.getUrlDecoder().decode(token.split("\\.")[1]));
                    String role = STALE_ROLE.get() ? "DISABLED_ROLE" : claims.get("role").asText();
                    body = "{\"role\":\"" + role + "\",\"active\":true}";
                }
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.getResponseHeaders().set("X-Test-Upstream", service);
                String origin = exchange.getRequestHeaders().getFirst("Origin");
                if (origin != null) exchange.getResponseHeaders().set("Access-Control-Allow-Origin", origin);
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, bytes.length);
                try (var output = exchange.getResponseBody()) { output.write(bytes); }
            });
            server.start();
            SERVERS.put(service, server);
            registry.add(service.toUpperCase(Locale.ROOT) + "_SERVICE_URL",
                    () -> "http://127.0.0.1:" + server.getAddress().getPort());
        }
    }

    @AfterAll
    static void stopUpstreams() { SERVERS.values().forEach(server -> server.stop(0)); }

    private WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();
    }

    private String token(String role) {
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),
                new JWTClaimsSet.Builder().subject(UUID.randomUUID().toString()).claim("role", role)
                        .issueTime(Date.from(Instant.now())).expirationTime(Date.from(Instant.now().plusSeconds(300)))
                        .build());
        try { jwt.sign(new MACSigner(KEY)); }
        catch (com.nimbusds.jose.JOSEException exception) { throw new IllegalStateException(exception); }
        return jwt.serialize();
    }

    @Test
    void configuredPredicatesRouteToTheCorrectUpstreamAndPreserveOrder() throws Exception {
        String customer = token("CUSTOMER");
        for (var route : Map.of(
                "/api/auth/login", "identity", "/api/hotels", "hotel",
                "/api/hotels/123/bookings", "booking",
                "/api/users/123/notifications", "notification", "/api/bookings", "booking",
                "/api/payments", "payment", "/api/chat/conversations", "chat", "/api/ai/test", "ai").entrySet()) {
            String credential = route.getKey().equals("/api/hotels/123/bookings")
                    ? token("HOTEL_ADMIN") : customer;
            client().get().uri(route.getKey()).headers(headers -> headers.setBearerAuth(credential))
                    .exchange().expectStatus().isOk().expectHeader().valueEquals("X-Test-Upstream", route.getValue());
        }
    }

    @Test
    void jwtResourceServerStillRejectsMissingAndInvalidCredentials() {
        client().get().uri("/api/payments").exchange().expectStatus().isUnauthorized();
        client().get().uri("/api/payments").headers(headers -> headers.setBearerAuth("invalid"))
                .exchange().expectStatus().isUnauthorized();
    }

    @Test
    void customerCannotUseSystemAdminRoutes() throws Exception {
        client().get().uri("/api/admin/wallet").headers(headers -> headers.setBearerAuth(token("CUSTOMER")))
                .exchange().expectStatus().isForbidden();
    }

    @Test
    void authoritativeRoleMismatchStillFailsClosed() throws Exception {
        STALE_ROLE.set(true);
        try {
            client().get().uri("/api/payments").headers(headers -> headers.setBearerAuth(token("CUSTOMER")))
                    .exchange().expectStatus().isUnauthorized();
        } finally { STALE_ROLE.set(false); }
    }

    @Test
    void corsPreflightAndDedupeFilterWork() throws Exception {
        client().options().uri("/api/payments").header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "GET").exchange().expectStatus().isOk()
                .expectHeader().valueEquals("Access-Control-Allow-Origin", "http://localhost:5173");
        client().get().uri("/api/hotels").header("Origin", "http://localhost:5173")
                .headers(headers -> headers.setBearerAuth(token("CUSTOMER"))).exchange().expectStatus().isOk()
                .expectHeader().value("Access-Control-Allow-Origin",
                        values -> assertThat(values).isEqualTo("http://localhost:5173"));
        client().options().uri("/api/payments").header("Origin", "https://forbidden.invalid")
                .header("Access-Control-Request-Method", "GET").exchange().expectStatus().isForbidden();
    }

    @Test
    void actuatorAndPrometheusAreAvailableWithoutPermissionWidening() {
        client().get().uri("/actuator/health").exchange().expectStatus().isOk();
        client().get().uri("/actuator/prometheus").exchange().expectStatus().isOk()
                .expectBody(String.class).value(body -> assertThat(body).contains("jvm_memory"));
        client().get().uri("/actuator/gateway/routes").exchange().expectStatus().isUnauthorized();
    }
}
