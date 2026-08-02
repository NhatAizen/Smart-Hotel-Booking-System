package com.smarthotel.identity.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.proc.SecurityContext;
import com.smarthotel.identity.security.JwtAuthenticationEntryPoint;
import com.smarthotel.identity.security.JwtProperties;
import com.smarthotel.identity.security.JwtRoleAuthenticationConverter;
import jakarta.servlet.DispatcherType;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;

import java.util.Base64;

@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecretKey jwtSecretKey(
            JwtProperties properties
    ) {
        if (properties.secret() == null
                || properties.secret().isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET chưa được cấu hình"
            );
        }

        final byte[] decodedKey;

        try {
            decodedKey = Base64.getDecoder().decode(
                    properties.secret().trim()
            );
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException(
                    "JWT_SECRET phải là Base64 hợp lệ",
                    exception
            );
        }

        if (decodedKey.length < 32) {
            throw new IllegalStateException(
                    "JWT_SECRET phải giải mã thành ít nhất 32 byte"
            );
        }

        return new SecretKeySpec(
                decodedKey,
                "HmacSHA256"
        );
    }

    @Bean
    public JwtEncoder jwtEncoder(
            SecretKey secretKey
    ) {
        ImmutableSecret<SecurityContext> secret =
                new ImmutableSecret<>(secretKey);

        return new NimbusJwtEncoder(secret);
    }

    @Bean
    public JwtDecoder jwtDecoder(
            SecretKey secretKey,
            JwtProperties properties
    ) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withSecretKey(secretKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();

        OAuth2TokenValidator<Jwt> timestampValidator =
                new JwtTimestampValidator();

        OAuth2TokenValidator<Jwt> issuerValidator =
                new JwtIssuerValidator(
                        properties.issuer()
                );

        decoder.setJwtValidator(
                new DelegatingOAuth2TokenValidator<>(
                        timestampValidator,
                        issuerValidator
                )
        );

        return decoder;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationEntryPoint entryPoint,
            JwtRoleAuthenticationConverter jwtConverter
    ) throws Exception {

        http
                .csrf(csrf -> csrf.disable())

                .sessionManagement(session -> session
                        .sessionCreationPolicy(
                                SessionCreationPolicy.STATELESS
                        )
                )

                .authorizeHttpRequests(authorize -> authorize
                        .dispatcherTypeMatchers(
                                DispatcherType.ERROR
                        )
                        .permitAll()

                        .requestMatchers(
                                "/api/auth/register",
                                "/api/auth/login",
                                "/api/auth/refresh",
                                "/api/auth/logout",
                                "/api/auth/verify-email",
                                "/api/auth/resend-verification",
                                "/api/auth/forgot-password",
                                "/api/auth/reset-password",

                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v3/api-docs",
                                "/v3/api-docs/**",

                                "/actuator/health",
                                "/actuator/info",
                                "/error"
                        )
                        .permitAll()

                        .requestMatchers(
                                "/api/auth/logout-all"
                        )
                        .authenticated()

                        .anyRequest()
                        .authenticated()
                )

                .oauth2ResourceServer(resourceServer ->
                        resourceServer
                                .authenticationEntryPoint(entryPoint)
                                .jwt(jwt -> jwt
                                        .jwtAuthenticationConverter(
                                                jwtConverter
                                        )
                                )
                )

                .exceptionHandling(exceptionHandling ->
                        exceptionHandling
                                .authenticationEntryPoint(entryPoint)
                )

                .httpBasic(httpBasic ->
                        httpBasic.disable()
                )

                .formLogin(form ->
                        form.disable()
                );

        return http.build();
    }
}