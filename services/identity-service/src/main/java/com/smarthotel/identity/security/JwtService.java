package com.smarthotel.identity.security;

import com.smarthotel.identity.user.entity.User;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;

import java.time.Instant;

/**
 * Sinh JWT Access Token sau khi người dùng đăng nhập thành công.
 */
@Service
public class JwtService {

    private final JwtEncoder jwtEncoder;
    private final JwtProperties jwtProperties;

    public JwtService(
            JwtEncoder jwtEncoder,
            JwtProperties jwtProperties
    ) {
        this.jwtEncoder = jwtEncoder;
        this.jwtProperties = jwtProperties;
    }

    public String generateAccessToken(User user) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plusSeconds(
                jwtProperties.expirationSeconds()
        );

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(jwtProperties.issuer())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)

                // Subject là ID người dùng.
                .subject(user.getId().toString())

                // Custom claims.
                .claim("email", user.getEmail())
                .claim("fullName", user.getFullName())
                .claim("role", user.getRole().name())
                .claim("emailVerified", user.isEmailVerified())
                .build();

        JwsHeader header = JwsHeader
                .with(MacAlgorithm.HS256)
                .type("JWT")
                .build();

        return jwtEncoder
                .encode(JwtEncoderParameters.from(header, claims))
                .getTokenValue();
    }

    public long getExpirationSeconds() {
        return jwtProperties.expirationSeconds();
    }
}