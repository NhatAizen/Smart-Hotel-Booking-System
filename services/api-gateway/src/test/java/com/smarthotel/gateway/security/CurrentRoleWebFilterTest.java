package com.smarthotel.gateway.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.UUID;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CurrentRoleWebFilterTest {

    @Test
    void allowsRequestWhenJwtRoleMatchesCurrentDatabaseRole() {
        CurrentRoleWebFilter filter = filterReturning(
                HttpStatus.OK,
                "{\"role\":\"HOTEL_ADMIN\",\"active\":true}"
        );
        MockServerWebExchange exchange = exchange();
        WebFilterChain chain = mock(WebFilterChain.class);
        when(chain.filter(exchange)).thenReturn(Mono.empty());

        StepVerifier.create(authenticated(filter.filter(exchange, chain), "HOTEL_ADMIN"))
                .verifyComplete();

        verify(chain).filter(exchange);
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void rejectsStaleJwtImmediatelyAfterRoleChange() {
        CurrentRoleWebFilter filter = filterReturning(
                HttpStatus.OK,
                "{\"role\":\"CUSTOMER\",\"active\":true}"
        );
        MockServerWebExchange exchange = exchange();
        WebFilterChain chain = mock(WebFilterChain.class);
        when(chain.filter(exchange)).thenReturn(Mono.empty());

        StepVerifier.create(authenticated(filter.filter(exchange, chain), "HOTEL_ADMIN"))
                .verifyComplete();

        verify(chain, never()).filter(exchange);
        assertThat(exchange.getResponse().getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void failsClosedWhenIdentityCannotConfirmCurrentRole() {
        CurrentRoleWebFilter filter = filterReturning(
                HttpStatus.SERVICE_UNAVAILABLE,
                ""
        );
        MockServerWebExchange exchange = exchange();
        WebFilterChain chain = mock(WebFilterChain.class);
        when(chain.filter(exchange)).thenReturn(Mono.empty());

        StepVerifier.create(authenticated(filter.filter(exchange, chain), "HOTEL_ADMIN"))
                .verifyComplete();

        verify(chain, never()).filter(exchange);
        assertThat(exchange.getResponse().getStatusCode())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    private CurrentRoleWebFilter filterReturning(HttpStatus status, String body) {
        WebClient.Builder builder = WebClient.builder()
                .exchangeFunction(request -> Mono.just(
                        ClientResponse.create(status)
                                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                                .body(body)
                                .build()
                ));
        return new CurrentRoleWebFilter(builder, "http://identity.test");
    }

    private MockServerWebExchange exchange() {
        return MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/hotels/mine").build()
        );
    }

    private Mono<Void> authenticated(Mono<Void> result, String role) {
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .subject(UUID.randomUUID().toString())
                .claim("role", role)
                .build();
        return result.contextWrite(ReactiveSecurityContextHolder.withAuthentication(
                new JwtAuthenticationToken(
                        jwt,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role))
                )
        ));
    }
}
