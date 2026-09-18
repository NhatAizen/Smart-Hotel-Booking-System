package com.smarthotel.booking.config;

import com.smarthotel.booking.security.CurrentRoleFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.client.RestClient;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

@Configuration
public class SecurityConfig {

    @Value("${security.jwt.secret}")
    private String jwtSecret;

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            RestClient.Builder restClientBuilder,
            @Value("${IDENTITY_SERVICE_URL:http://localhost:8081}")
            String identityServiceUrl
    ) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                "/actuator/health",
                                "/actuator/info",
                                "/actuator/prometheus",
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v3/api-docs",
                                "/v3/api-docs/**",
                                "/error"
                        ).permitAll()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/role-change/eligibility/bookings"
                        ).hasAnyRole("SYSTEM_ADMIN", "HOTEL_ADMIN")
                        .requestMatchers(
                                HttpMethod.PUT,
                                "/api/role-change/owners/*/demotion-fence"
                        ).hasRole("SYSTEM_ADMIN")
                        .requestMatchers(
                                HttpMethod.DELETE,
                                "/api/role-change/owners/*/demotion-fence/*"
                        ).hasRole("SYSTEM_ADMIN")
                        .requestMatchers(
                                "/api/bookings/check-in/**",
                                "/api/bookings/*/check-in",
                                "/api/bookings/*/check-in/**",
                                "/api/bookings/current-stays",
                                "/api/bookings/*/check-out",
                                "/api/bookings/*/late-checkout/assess",
                                "/api/bookings/*/no-show"
                        ).hasRole("HOTEL_ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/bookings", "/api/bookings/batch")
                        .hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.GET, "/api/bookings/me")
                        .hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.GET, "/api/hotels/*/bookings")
                        .hasAnyRole("HOTEL_ADMIN", "SYSTEM_ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/bookings/*/cancel")
                        .hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.GET, "/api/bookings/*/qr")
                        .hasAnyRole("CUSTOMER", "HOTEL_ADMIN")
                        .requestMatchers(
                                HttpMethod.PATCH,
                                "/api/customers/*/bookings/*/hide",
                                "/api/bookings/*/hide"
                        ).hasRole("CUSTOMER")
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/favorites",
                                "/api/favorites/**"
                        ).hasRole("CUSTOMER")
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/favorites",
                                "/api/favorites/**"
                        ).hasRole("CUSTOMER")
                        .requestMatchers(
                                HttpMethod.DELETE,
                                "/api/favorites",
                                "/api/favorites/**"
                        ).hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.POST, "/api/reviews")
                        .hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.GET, "/api/complaints/*/evidence/*/content")
                        .hasAnyRole("CUSTOMER", "HOTEL_ADMIN", "SYSTEM_ADMIN")
                        .requestMatchers("/api/complaints/**")
                        .hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.POST, "/api/availability/holds")
                        .hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.GET, "/api/reviews/me")
                        .hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.GET, "/api/reviews/hotels/**")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/reviews/media/**")
                        .permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/pricing/quote")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/campaigns/active", "/api/promotions/available")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/platform-policies")
                        .permitAll()
                        .requestMatchers(
                                "/api/membership/me",
                                "/api/membership/tiers",
                                "/api/discounts/preview",
                                "/api/promotions/recommendations",
                                "/api/promotions/saved/me",
                                "/api/promotions/*/save"
                        )
                        .hasRole("CUSTOMER")
                        .requestMatchers(
                                "/api/hotel-admin/promotions/**",
                                "/api/hotel-admin/reviews/**",
                                "/api/hotel-admin/complaints/**"
                        )
                        .hasRole("HOTEL_ADMIN")
                        .requestMatchers(
                                "/api/admin/promotions/**",
                                "/api/admin/campaigns/**",
                                "/api/admin/membership-tiers/**",
                                "/api/admin/reviews/**",
                                "/api/admin/complaints/**"
                        )
                        .hasRole("SYSTEM_ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/admin/platform-policies")
                        .hasRole("SYSTEM_ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/reviews/bookings/**")
                        .hasAnyRole("CUSTOMER", "HOTEL_ADMIN")
                        .requestMatchers(
                                "/api/bookings/**",
                                "/api/customers/**",
                                "/api/hotels/**",
                                "/api/availability/**"
                        ).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt
                        .decoder(jwtDecoder())
                        .jwtAuthenticationConverter(jwtAuthenticationConverter())))
                .addFilterAfter(
                        new CurrentRoleFilter(restClientBuilder, identityServiceUrl),
                        BearerTokenAuthenticationFilter.class
                )
                .httpBasic(httpBasic -> httpBasic.disable())
                .formLogin(form -> form.disable());

        return http.build();
    }

    @Bean
    JwtDecoder jwtDecoder() {
        if (jwtSecret == null || jwtSecret.isBlank()) {
            throw new IllegalStateException("JWT_SECRET chưa được cấu hình cho booking-service");
        }

        final byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(jwtSecret.trim());
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("JWT_SECRET phải là Base64 hợp lệ", exception);
        }

        if (decoded.length < 32) {
            throw new IllegalStateException("JWT_SECRET phải giải mã thành ít nhất 32 byte");
        }

        SecretKey key = new SecretKeySpec(decoded, "HmacSHA256");
        return NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
    }

    private Converter<Jwt, ? extends AbstractAuthenticationToken>
    jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("role");
        authorities.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }
}
