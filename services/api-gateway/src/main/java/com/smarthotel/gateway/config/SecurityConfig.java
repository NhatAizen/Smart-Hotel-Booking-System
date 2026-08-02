package com.smarthotel.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.server.SecurityWebFilterChain;
import reactor.core.publisher.Mono;

import java.util.List;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(
            ServerHttpSecurity http
    ) {
        return http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)

                .cors(cors -> {
                })

                .authorizeExchange(exchanges -> exchanges

                        // =================================================
                        // PUBLIC ENDPOINTS
                        // =================================================

                        .pathMatchers(
                                "/actuator/health",
                                "/actuator/info",
                                "/error"
                        )
                        .permitAll()

                        .pathMatchers(
                                HttpMethod.OPTIONS,
                                "/**"
                        )
                        .permitAll()

                        .pathMatchers(
                                "/api/auth/register",
                                "/api/auth/login",
                                "/api/auth/refresh",
                                "/api/auth/verify-email",
                                "/api/auth/resend-verification",
                                "/api/auth/forgot-password",
                                "/api/auth/reset-password"
                        )
                        .permitAll()

                        // Guest được xem khách sạn, loại phòng và phòng.
                        .pathMatchers(
                                HttpMethod.GET,
                                "/api/hotels/**",
                                "/api/room-types/**",
                                "/api/rooms/**"
                        )
                        .permitAll()

                        // =================================================
                        // SYSTEM ADMIN
                        // =================================================

                        // Chỉ SYSTEM_ADMIN được tạo khách sạn.
                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/hotels"
                        )
                        .hasRole("SYSTEM_ADMIN")

                        // Chỉ SYSTEM_ADMIN được sửa hoặc xóa khách sạn.
                        .pathMatchers(
                                HttpMethod.PUT,
                                "/api/hotels/**"
                        )
                        .hasRole("SYSTEM_ADMIN")

                        .pathMatchers(
                                HttpMethod.PATCH,
                                "/api/hotels/**"
                        )
                        .hasRole("SYSTEM_ADMIN")

                        .pathMatchers(
                                HttpMethod.DELETE,
                                "/api/hotels/**"
                        )
                        .hasRole("SYSTEM_ADMIN")

                        .pathMatchers(
                                "/api/admin/**"
                        )
                        .hasRole("SYSTEM_ADMIN")

                        // =================================================
                        // HOTEL ADMIN
                        // =================================================

                        // HOTEL_ADMIN hoặc SYSTEM_ADMIN được quản lý
                        // loại phòng.
                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/room-types/**"
                        )
                        .hasAnyRole(
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        .pathMatchers(
                                HttpMethod.PUT,
                                "/api/room-types/**"
                        )
                        .hasAnyRole(
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        .pathMatchers(
                                HttpMethod.PATCH,
                                "/api/room-types/**"
                        )
                        .hasAnyRole(
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        .pathMatchers(
                                HttpMethod.DELETE,
                                "/api/room-types/**"
                        )
                        .hasAnyRole(
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        // HOTEL_ADMIN hoặc SYSTEM_ADMIN được quản lý phòng.
                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/rooms/**",
                                "/api/hotels/*/rooms"
                        )
                        .hasAnyRole(
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        .pathMatchers(
                                HttpMethod.PUT,
                                "/api/rooms/**"
                        )
                        .hasAnyRole(
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        .pathMatchers(
                                HttpMethod.PATCH,
                                "/api/rooms/**"
                        )
                        .hasAnyRole(
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        .pathMatchers(
                                HttpMethod.DELETE,
                                "/api/rooms/**"
                        )
                        .hasAnyRole(
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        // =================================================
                        // CUSTOMER OPERATIONS
                        // =================================================

                        .pathMatchers(
                                "/api/bookings/**",
                                "/api/payments/**",
                                "/api/notifications/**",
                                "/api/users/*/notifications",
                                "/api/ai/**"
                        )
                        .hasAnyRole(
                                "CUSTOMER",
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        // Endpoint còn lại cần đăng nhập.
                        .anyExchange()
                        .authenticated()
                )

                .oauth2ResourceServer(oauth2 ->
                        oauth2.jwt(jwt ->
                                jwt.jwtAuthenticationConverter(
                                        jwtAuthenticationConverter()
                                )
                        )
                )

                .build();
    }

    /**
     * Chuyển claim:
     *
     * role = CUSTOMER
     *
     * thành authority:
     *
     * ROLE_CUSTOMER
     *
     * Không khai báo @Bean ở hàm này, vì Spring Boot sẽ cố đăng ký
     * Converter lambda vào WebFlux ConversionService và làm Gateway
     * khởi động thất bại.
     */
    private Converter<
            Jwt,
            Mono<AbstractAuthenticationToken>
            > jwtAuthenticationConverter() {

        return jwt -> {
            String role = jwt.getClaimAsString("role");

            if (role == null || role.isBlank()) {
                return Mono.just(
                        new JwtAuthenticationToken(
                                jwt,
                                List.of()
                        )
                );
            }

            SimpleGrantedAuthority authority =
                    new SimpleGrantedAuthority(
                            "ROLE_" + role.trim()
                    );

            return Mono.just(
                    new JwtAuthenticationToken(
                            jwt,
                            List.of(authority),
                            jwt.getSubject()
                    )
            );
        };
    }
}