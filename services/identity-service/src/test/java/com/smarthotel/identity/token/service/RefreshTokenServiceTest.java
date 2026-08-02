package com.smarthotel.identity.token.service;

import com.smarthotel.identity.common.exception.InvalidRefreshTokenException;
import com.smarthotel.identity.security.JwtProperties;
import com.smarthotel.identity.token.repository.RefreshTokenRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RefreshTokenServiceTest {

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Test
    void rotate_shouldThrow_whenRefreshTokenDoesNotExist() {
        JwtProperties jwtProperties =
                new JwtProperties(
                        "TgvvB+E/RaVVss4JGC4ulmLvhoa0JL1H/K07htblWLc=",
                        "smart-hotel-identity-service",
                        3600,
                        2592000
                );

        RefreshTokenService service =
                new RefreshTokenService(
                        refreshTokenRepository,
                        jwtProperties
                );

        when(
                refreshTokenRepository.findByTokenHash(
                        anyString()
                )
        ).thenReturn(Optional.empty());

        assertThrows(
                InvalidRefreshTokenException.class,
                () -> service.rotate(
                        "invalid-refresh-token"
                )
        );
    }

    @Test
    void rotate_shouldThrow_whenRefreshTokenIsBlank() {
        JwtProperties jwtProperties =
                new JwtProperties(
                        "TgvvB+E/RaVVss4JGC4ulmLvhoa0JL1H/K07htblWLc=",
                        "smart-hotel-identity-service",
                        3600,
                        2592000
                );

        RefreshTokenService service =
                new RefreshTokenService(
                        refreshTokenRepository,
                        jwtProperties
                );

        assertThrows(
                InvalidRefreshTokenException.class,
                () -> service.rotate(" ")
        );
    }
}