package com.smarthotel.payment.config;

import com.smarthotel.payment.security.CurrentRoleFilter;
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
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            RestClient.Builder restClientBuilder,
            @Value("${IDENTITY_SERVICE_URL:http://localhost:8081}")
            String identityServiceUrl
    ) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.POST, "/api/payments/payos/webhook").permitAll()
                        .requestMatchers(
                                "/actuator/health", "/actuator/info", "/error",
                                "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs", "/v3/api-docs/**"
                        ).permitAll()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/role-change/owners/*/payment-eligibility"
                        ).hasAnyRole("SYSTEM_ADMIN", "HOTEL_ADMIN")
                        .requestMatchers(
                                HttpMethod.PUT,
                                "/api/role-change/owners/*/demotion-fence"
                        ).hasRole("SYSTEM_ADMIN")
                        .requestMatchers(
                                HttpMethod.DELETE,
                                "/api/role-change/owners/*/demotion-fence/*"
                        ).hasRole("SYSTEM_ADMIN")
                        .requestMatchers("/api/admin/**").hasRole("SYSTEM_ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/wallets/top-up/payos").hasRole("HOTEL_ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/withdrawals/hotel").hasRole("HOTEL_ADMIN")
                        .requestMatchers(HttpMethod.GET,
                                "/api/withdrawals/*/receiver-qr",
                                "/api/withdrawals/*/transfer-proof")
                        .hasAnyRole("CUSTOMER", "HOTEL_ADMIN", "SYSTEM_ADMIN")
                        .requestMatchers("/api/wallets/me", "/api/wallets/me/transactions",
                                "/api/withdrawals", "/api/withdrawals/me")
                        .hasAnyRole("CUSTOMER", "HOTEL_ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/payments/*/refund").hasRole("SYSTEM_ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/payments").hasRole("SYSTEM_ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/payments/payos/check-in/*").hasRole("HOTEL_ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/payments/cash-at-hotel/*").hasRole("HOTEL_ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/payments/wallet/checkout").hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.POST, "/api/payments/payos/checkout").hasRole("CUSTOMER")
                        .requestMatchers("/api/payments/payos/orders/**")
                        .hasAnyRole("CUSTOMER", "HOTEL_ADMIN")
                        .requestMatchers(
                                "/api/payments/**", "/api/bookings/*/payments", "/api/customers/*/payments"
                        ).hasAnyRole("CUSTOMER", "HOTEL_ADMIN", "SYSTEM_ADMIN")
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
            throw new IllegalStateException("JWT_SECRET chưa được cấu hình cho payment-service");
        }
        final byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(jwtSecret.trim());
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("JWT_SECRET phải là Base64 hợp lệ", exception);
        }
        if (decoded.length < 32) throw new IllegalStateException("JWT_SECRET phải giải mã thành ít nhất 32 byte");
        SecretKey key = new SecretKeySpec(decoded, "HmacSHA256");
        return NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    }

    private Converter<Jwt, ? extends AbstractAuthenticationToken> jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("role");
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }
}
