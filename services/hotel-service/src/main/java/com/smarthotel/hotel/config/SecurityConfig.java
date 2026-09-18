package com.smarthotel.hotel.config;

import com.smarthotel.hotel.security.CurrentRoleFilter;
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
    )
            throws Exception {

        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(
                        SessionCreationPolicy.STATELESS
                ))
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
                                HttpMethod.GET,
                                "/api/role-change/owners/*/hotels"
                        ).hasAnyRole("SYSTEM_ADMIN", "HOTEL_ADMIN")

                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/role-change/owners/*/deactivate-hotels"
                        ).hasRole("SYSTEM_ADMIN")

                        .requestMatchers(
                                HttpMethod.PUT,
                                "/api/role-change/owners/*/demotion-fence"
                        ).hasRole("SYSTEM_ADMIN")

                        .requestMatchers(
                                HttpMethod.DELETE,
                                "/api/role-change/owners/*/demotion-fence/*"
                        ).hasRole("SYSTEM_ADMIN")

                        .requestMatchers("/api/admin/hotels/**", "/api/admin/room-types/**")
                        .hasRole("SYSTEM_ADMIN")

                        .requestMatchers(HttpMethod.GET,
                                "/api/hotels/mine",
                                "/api/hotels/mine/**",
                                "/api/hotels/*/room-types/manage",
                                "/api/hotels/*/rooms/manage",
                                "/api/room-types/*/manage"
                        ).hasAnyRole("HOTEL_ADMIN", "SYSTEM_ADMIN")

                        .requestMatchers(HttpMethod.POST,
                                "/api/hotels",
                                "/api/hotels/*/images",
                                "/api/hotels/*/room-types",
                                "/api/hotels/*/rooms",
                                "/api/hotels/*/rooms/batch",
                                "/api/room-types/*/images"
                        ).hasRole("HOTEL_ADMIN")

                        .requestMatchers(HttpMethod.PUT,
                                "/api/hotels/*/policies",
                                "/api/hotels/**",
                                "/api/room-types/**",
                                "/api/rooms/**"
                        ).hasRole("HOTEL_ADMIN")

                        .requestMatchers(HttpMethod.PATCH,
                                "/api/hotels/*/submit",
                                "/api/hotels/*/images/*/cover",
                                "/api/room-types/*/images/*/cover",
                                "/api/room-types/**",
                                "/api/rooms/**"
                        ).hasRole("HOTEL_ADMIN")

                        .requestMatchers(HttpMethod.DELETE,
                                "/api/hotels/**",
                                "/api/room-types/**",
                                "/api/rooms/**"
                        ).hasRole("HOTEL_ADMIN")

                        .requestMatchers(HttpMethod.GET,
                                "/api/hotels/media/**",
                                "/api/hotels/**",
                                "/api/room-types/**",
                                "/api/rooms/**"
                        ).permitAll()

                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt
                        .decoder(jwtDecoder())
                        .jwtAuthenticationConverter(jwtAuthenticationConverter())
                ))
                .addFilterAfter(
                        new CurrentRoleFilter(restClientBuilder, identityServiceUrl),
                        BearerTokenAuthenticationFilter.class
                )
                .httpBasic(httpBasic -> httpBasic.disable())
                .formLogin(formLogin -> formLogin.disable());

        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        if (jwtSecret == null || jwtSecret.isBlank()) {
            throw new IllegalStateException("JWT_SECRET chưa được cấu hình");
        }

        final byte[] decodedSecret;

        try {
            decodedSecret = Base64.getDecoder().decode(jwtSecret.trim());
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException(
                    "JWT_SECRET phải là chuỗi Base64 hợp lệ",
                    exception
            );
        }

        if (decodedSecret.length < 32) {
            throw new IllegalStateException(
                    "JWT_SECRET phải giải mã thành ít nhất 32 byte"
            );
        }

        SecretKey secretKey = new SecretKeySpec(decodedSecret, "HmacSHA256");

        return NimbusJwtDecoder
                .withSecretKey(secretKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
    }

    private Converter<Jwt, ? extends AbstractAuthenticationToken>
    jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authoritiesConverter =
                new JwtGrantedAuthoritiesConverter();
        authoritiesConverter.setAuthoritiesClaimName("role");
        authoritiesConverter.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter authenticationConverter =
                new JwtAuthenticationConverter();
        authenticationConverter.setJwtGrantedAuthoritiesConverter(
                authoritiesConverter
        );

        return authenticationConverter;
    }
}
