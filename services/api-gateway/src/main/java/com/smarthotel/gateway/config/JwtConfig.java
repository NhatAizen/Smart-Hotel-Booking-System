package com.smarthotel.gateway.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

@Configuration
public class JwtConfig {

    @Bean
    public ReactiveJwtDecoder reactiveJwtDecoder(
            @Value("${app.jwt.secret}") String encodedSecret
    ) {
        byte[] secretBytes =
                Base64.getDecoder().decode(encodedSecret);

        SecretKey secretKey =
                new SecretKeySpec(
                        secretBytes,
                        "HmacSHA256"
                );

        return NimbusReactiveJwtDecoder
                .withSecretKey(secretKey)
                .build();
    }
}