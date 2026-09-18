package com.smarthotel.identity.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.proc.SecurityContext;
import com.smarthotel.identity.oauth.handler.OAuth2AuthenticationFailureHandler;
import com.smarthotel.identity.oauth.handler.OAuth2AuthenticationSuccessHandler;
import com.smarthotel.identity.oauth.service.CustomOAuth2UserService;
import com.smarthotel.identity.oauth.service.CustomOidcUserService;
import com.smarthotel.identity.security.JwtAuthenticationEntryPoint;
import com.smarthotel.identity.security.JwtProperties;
import com.smarthotel.identity.security.JwtRoleAuthenticationConverter;
import jakarta.servlet.DispatcherType;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
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
        if (
                properties.secret() == null
                        || properties.secret().isBlank()
        ) {
            throw new IllegalStateException(
                    "JWT_SECRET chưa được cấu hình"
            );
        }

        final byte[] decodedKey;

        try {
            decodedKey = Base64
                    .getDecoder()
                    .decode(
                            properties.secret().trim()
                    );
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException(
                    "JWT_SECRET phải là chuỗi Base64 hợp lệ",
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
        return new NimbusJwtEncoder(
                new ImmutableSecret<SecurityContext>(
                        secretKey
                )
        );
    }

    @Bean
    public JwtDecoder jwtDecoder(
            SecretKey secretKey,
            JwtProperties properties
    ) {
        NimbusJwtDecoder decoder =
                NimbusJwtDecoder
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
            JwtRoleAuthenticationConverter jwtConverter,
            CustomOidcUserService customOidcUserService,
            CustomOAuth2UserService customOAuth2UserService,
            OAuth2AuthenticationSuccessHandler successHandler,
            OAuth2AuthenticationFailureHandler failureHandler
    ) throws Exception {

        http
                .csrf(csrf ->
                        csrf.disable()
                )

                .sessionManagement(session ->
                        session.sessionCreationPolicy(
                                SessionCreationPolicy.IF_REQUIRED
                        )
                )

                .authorizeHttpRequests(authorize ->
                        authorize
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
                                        "/api/auth/oauth2/exchange",
                                        "/oauth2/**",
                                        "/login/oauth2/**"
                                )
                                .permitAll()

                                .requestMatchers(
                                        HttpMethod.GET,
                                        "/api/users/media/**",
                                        "/api/users/*/public-profile"
                                )
                                .permitAll()

                                .requestMatchers(
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
                                        "/api/admin/partner-requests/**",
                                        "/api/admin/users/**"
                                )
                                .hasRole("SYSTEM_ADMIN")

                                .requestMatchers(
                                        "/api/partner-requests/deactivation",
                                        "/api/partner-requests/deactivation/**"
                                )
                                .hasRole("HOTEL_ADMIN")

                                .requestMatchers(
                                        HttpMethod.POST,
                                        "/api/partner-requests",
                                        "/api/partner-requests/ocr/**",
                                        "/api/partner-requests/ekyc/**"
                                )
                                .hasRole("CUSTOMER")

                                .requestMatchers(
                                        HttpMethod.GET,
                                        "/api/partner-requests/me"
                                )
                                .hasAnyRole(
                                        "CUSTOMER",
                                        "HOTEL_ADMIN"
                                )

                                .requestMatchers(
                                        HttpMethod.GET,
                                        "/api/partner-requests/me/cccd/**",
                                        "/api/partner-requests/me/documents/**"
                                )
                                .hasAnyRole(
                                        "CUSTOMER",
                                        "HOTEL_ADMIN"
                                )

                                .requestMatchers(
                                        "/api/auth/logout-all"
                                )
                                .authenticated()

                                .anyRequest()
                                .authenticated()
                )

                .oauth2Login(oauth2 ->
                        oauth2
                                .userInfoEndpoint(userInfo ->
                                        userInfo
                                                /*
                                                 * Google trả về OidcUser.
                                                 */
                                                .oidcUserService(
                                                        customOidcUserService
                                                )

                                                /*
                                                 * Facebook trả về OAuth2User.
                                                 */
                                                .userService(
                                                        customOAuth2UserService
                                                )
                                )
                                .successHandler(successHandler)
                                .failureHandler(failureHandler)
                )

                .oauth2ResourceServer(resourceServer ->
                        resourceServer
                                .authenticationEntryPoint(entryPoint)
                                .jwt(jwt ->
                                        jwt.jwtAuthenticationConverter(
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
