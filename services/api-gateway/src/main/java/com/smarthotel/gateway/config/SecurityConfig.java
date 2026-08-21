package com.smarthotel.gateway.config;

import com.smarthotel.gateway.security.CurrentRoleWebFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.config.web.server.SecurityWebFiltersOrder;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(
            ServerHttpSecurity http,
            WebClient.Builder webClientBuilder,
            @Value("${IDENTITY_SERVICE_URL:http://localhost:8081}")
            String identityServiceUrl
    ) {
        CurrentRoleWebFilter currentRoleWebFilter = new CurrentRoleWebFilter(
                webClientBuilder,
                identityServiceUrl
        );
        return http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)

                /*
                 * CORS được cấu hình trong application.yml.
                 * Bật cors() để Spring Security sử dụng cấu hình đó.
                 */
                .cors(cors -> {
                })

                .authorizeExchange(exchanges -> exchanges

                        /*
                         * Preflight request của trình duyệt phải được public.
                         */
                        .pathMatchers(
                                HttpMethod.OPTIONS,
                                "/**"
                        )
                        .permitAll()

                        .pathMatchers(
                                "/actuator/health",
                                "/actuator/info",
                                "/error"
                        )
                        .permitAll()

                        /* WebSocket tự xác minh JWT trong handshake query token. */
                        .pathMatchers("/ws/**")
                        .permitAll()

                        /*
                         * Avatar/profile media phải public.
                         *
                         * Trình duyệt tải ảnh bằng thẻ <img src="..."> nên request
                         * không tự gắn Authorization: Bearer <JWT>.
                         * Chỉ public endpoint đọc file ảnh; các API /api/users/me
                         * bên dưới vẫn yêu cầu đăng nhập.
                         */
                        .pathMatchers(
                                HttpMethod.GET,
                                "/api/users/media/**"
                        )
                        .permitAll()

                        /* PayOS gọi trực tiếp, không có JWT; payment-service vẫn kiểm tra signature. */
                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/payments/payos/webhook"
                        )
                        .permitAll()

                        /*
                         * Các API xác thực không yêu cầu JWT.
                         */
                        .pathMatchers(
                                "/api/auth/register",
                                "/api/auth/login",
                                "/api/auth/refresh",
                                "/api/auth/logout",
                                "/api/auth/verify-email",
                                "/api/auth/resend-verification",
                                "/api/auth/forgot-password",
                                "/api/auth/reset-password",
                                "/api/auth/oauth2/exchange"
                        )
                        .permitAll()

                        /*
                         * SYSTEM ADMIN.
                         */
                        .pathMatchers(
                                "/api/admin/partner-requests/**",
                                "/api/admin/users/**",
                                "/api/admin/hotels/**",
                                "/api/admin/room-types/**",
                                "/api/admin/wallet/**",
                                "/api/admin/withdrawals/**",
                                "/api/admin/payments/**",
                                "/api/admin/refunds/**"
                        )
                        .hasRole("SYSTEM_ADMIN")

                        .pathMatchers(HttpMethod.GET, "/api/refunds/*/hotel-proof")
                        .hasAnyRole("CUSTOMER", "HOTEL_ADMIN", "SYSTEM_ADMIN")

                        .pathMatchers(HttpMethod.POST, "/api/refunds/requests")
                        .hasRole("CUSTOMER")

                        .pathMatchers(HttpMethod.GET, "/api/refunds/requests/me", "/api/refunds/requests/booking/*")
                        .hasRole("CUSTOMER")

                        .pathMatchers(HttpMethod.GET, "/api/refunds/hotel")
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(HttpMethod.POST,
                                "/api/refunds/*/approve",
                                "/api/refunds/*/reject",
                                "/api/refunds/*/hotel-proof")
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/wallets/top-up/payos"
                        )
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                "/api/wallets/me",
                                "/api/wallets/me/transactions",
                                "/api/withdrawals",
                                "/api/withdrawals/me"
                        )
                        .hasAnyRole("CUSTOMER", "HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/payments/wallet/checkout"
                        )
                        .hasRole("CUSTOMER")

                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/payments/cash-at-hotel/*",
                                "/api/payments/payos/check-in/*"
                        )
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.PATCH,
                                "/api/payments/*/refund"
                        )
                        .hasRole("SYSTEM_ADMIN")

                        .pathMatchers(HttpMethod.PATCH, "/api/bookings/*/no-show")
                        .hasRole("HOTEL_ADMIN")

                        /*
                         * Toàn bộ luồng QR check-in và xác minh CCCD chỉ dành cho HOTEL_ADMIN.
                         */
                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/bookings/check-in/verify",
                                "/api/bookings/*/check-in/**"
                        )
                        .hasRole("HOTEL_ADMIN")

                        /*
                         * CUSTOMER gửi hồ sơ đối tác.
                         */
                        .pathMatchers(
                                "/api/partner-requests/deactivation",
                                "/api/partner-requests/deactivation/**"
                        )
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/partner-requests",
                                "/api/partner-requests/ocr/**",
                                "/api/partner-requests/ekyc/**"
                        )
                        .hasRole("CUSTOMER")

                        .pathMatchers(
                                HttpMethod.GET,
                                "/api/partner-requests/me"
                        )
                        .hasAnyRole(
                                "CUSTOMER",
                                "HOTEL_ADMIN"
                        )

                        .pathMatchers(
                                HttpMethod.GET,
                                "/api/partner-requests/me/cccd/**"
                        )
                        .hasAnyRole(
                                "CUSTOMER",
                                "HOTEL_ADMIN"
                        )

                        /*
                         * HOTEL ADMIN đăng ký và quản lý khách sạn.
                         */
                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/hotels"
                        )
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.GET,
                                "/api/hotels/mine"
                        )
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.PUT,
                                "/api/hotels/**"
                        )
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.DELETE,
                                "/api/hotels/**"
                        )
                        .hasRole("HOTEL_ADMIN")

                        /*
                         * HOTEL ADMIN xem booking theo khách sạn.
                         *
                         * Phải đứng trước rule GET /api/hotels/** permitAll
                         * ở phía dưới để không vô tình public danh sách booking.
                         */
                        .pathMatchers(
                                HttpMethod.GET,
                                "/api/hotels/*/bookings"
                        )
                        .hasRole("HOTEL_ADMIN")

                        /*
                         * HOTEL ADMIN quản lý loại phòng và phòng.
                         */
                        .pathMatchers(
                                HttpMethod.GET,
                                "/api/hotels/*/rooms/manage"
                        )
                        .hasAnyRole(
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/hotels/*/rooms",
                                "/api/room-types/**"
                        )
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.PUT,
                                "/api/room-types/**",
                                "/api/rooms/**"
                        )
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.PATCH,
                                "/api/room-types/**",
                                "/api/rooms/**"
                        )
                        .hasRole("HOTEL_ADMIN")

                        .pathMatchers(
                                HttpMethod.DELETE,
                                "/api/room-types/**",
                                "/api/rooms/**"
                        )
                        .hasRole("HOTEL_ADMIN")

                        /*
                         * Báo giá động phải public vì Guest/Customer cần xem
                         * giá cuối tuần và ngày đặc biệt trước khi đăng nhập/đặt phòng.
                         * Booking Service vẫn là nơi tính giá thật.
                         */
                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/pricing/quote"
                        )
                        .permitAll()

                        /*
                         * Guest xem khách sạn/phòng đã được duyệt.
                         */
                        .pathMatchers(
                                HttpMethod.GET,
                                "/api/hotels/**",
                                "/api/room-types/**",
                                "/api/rooms/**",
                                "/api/availability/**",
                                "/api/reviews/**"
                        )
                        .permitAll()

                        /*
                         * CUSTOMER quản lý danh sách khách sạn yêu thích.
                         */
                        .pathMatchers(
                                "/api/favorites",
                                "/api/favorites/**"
                        )
                        .hasRole("CUSTOMER")

                        /*
                         * Customer self-booking endpoint dùng cho Enziu AI và trang cá nhân.
                         */
                        .pathMatchers(
                                HttpMethod.GET,
                                "/api/bookings/me"
                        )
                        .hasRole("CUSTOMER")

                        .pathMatchers(
                                HttpMethod.PATCH,
                                "/api/bookings/*/cancel"
                        )
                        .hasRole("CUSTOMER")


                        /*
                         * CUSTOMER chat với khách sạn theo booking đã xác nhận.
                         */
                        .pathMatchers("/api/chat/**")
                        .hasRole("CUSTOMER")

                        /*
                         * HOTEL ADMIN quản lý hội thoại của khách sạn.
                         */
                        .pathMatchers("/api/hotel-admin/chat/**")
                        .hasRole("HOTEL_ADMIN")

                        /*
                         * HOTEL ADMIN chỉ quản lý/phản hồi review của khách sạn mình.
                         */
                        .pathMatchers("/api/hotel-admin/reviews/**")
                        .hasRole("HOTEL_ADMIN")

                        /*
                         * SYSTEM ADMIN kiểm duyệt review toàn hệ thống.
                         */
                        .pathMatchers("/api/admin/reviews/**")
                        .hasRole("SYSTEM_ADMIN")

                        /*
                         * Enziu AI V2 đọc booking cá nhân nên chỉ CUSTOMER được gọi.
                         */
                        .pathMatchers(
                                HttpMethod.POST,
                                "/api/ai/assistant"
                        )
                        .hasRole("CUSTOMER")

                        /*
                         * Các API nghiệp vụ còn lại yêu cầu đăng nhập.
                         */
                        .pathMatchers(
                                "/api/bookings/**",
                                "/api/reviews/**",
                                "/api/payments/**",
                                "/api/notifications/**",
                                "/api/users/*/notifications",
                                "/api/users/*/notifications/**",
                                "/api/ai/**"
                        )
                        .hasAnyRole(
                                "CUSTOMER",
                                "HOTEL_ADMIN",
                                "SYSTEM_ADMIN"
                        )

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

                .addFilterAfter(
                        currentRoleWebFilter,
                        SecurityWebFiltersOrder.AUTHENTICATION
                )

                .build();
    }

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
