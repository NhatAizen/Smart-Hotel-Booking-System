package com.smarthotel.realtime.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;
import java.util.Map;

@Component
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private final JwtDecoder jwtDecoder;

    public JwtHandshakeInterceptor(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.issuer}") String issuer
    ) {
        final byte[] decodedKey;
        try {
            decodedKey = Base64.getDecoder().decode(secret);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("JWT_SECRET phải là chuỗi Base64 hợp lệ", exception);
        }

        if (decodedKey.length < 32) {
            throw new IllegalStateException("JWT_SECRET phải giải mã thành ít nhất 32 byte");
        }

        SecretKey key = new SecretKeySpec(decodedKey, "HmacSHA256");
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();

        OAuth2TokenValidator<Jwt> timestampValidator = new JwtTimestampValidator();
        OAuth2TokenValidator<Jwt> issuerValidator = new JwtIssuerValidator(issuer);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                timestampValidator,
                issuerValidator
        ));
        this.jwtDecoder = decoder;
    }

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes
    ) {
        MultiValueMap<String, String> query = UriComponentsBuilder.fromUri(request.getURI())
                .build()
                .getQueryParams();
        String token = query.getFirst("token");

        // Guest vẫn được kết nối để nhận các event public như tình trạng phòng.
        if (token == null || token.isBlank()) {
            attributes.put("role", "GUEST");
            return true;
        }

        try {
            Jwt jwt = jwtDecoder.decode(token);
            attributes.put("userId", jwt.getSubject());
            attributes.put("role", normalizeRole(jwt.getClaimAsString("role")));
            return true;
        } catch (JwtException exception) {
            return false;
        }
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception
    ) {
        // no-op
    }

    private String normalizeRole(String value) {
        if (value == null || value.isBlank()) return "GUEST";
        return value.trim().replaceFirst("(?i)^ROLE_", "").toUpperCase();
    }
}
