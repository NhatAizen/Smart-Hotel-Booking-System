package com.smarthotel.identity.auth.service;

import com.smarthotel.identity.accounttoken.service.AccountActionTokenService;
import com.smarthotel.identity.auth.dto.AuthResponse;
import com.smarthotel.identity.auth.dto.LoginRequest;
import com.smarthotel.identity.common.exception.InvalidCredentialsException;
import com.smarthotel.identity.mail.AppMailProperties;
import com.smarthotel.identity.mail.MailService;
import com.smarthotel.identity.security.JwtService;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import com.smarthotel.identity.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @Mock
    private RefreshTokenService refreshTokenService;

    @Mock
    private AccountActionTokenService accountActionTokenService;

    @Mock
    private MailService mailService;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        AppMailProperties mailProperties =
                new AppMailProperties(
                        "no-reply@smarthotel.local",
                        "http://localhost:8081",
                        86400,
                        1800
                );

        authService = new AuthService(
                userRepository,
                passwordEncoder,
                jwtService,
                refreshTokenService,
                accountActionTokenService,
                mailService,
                mailProperties
        );
    }

    @Test
    void login_shouldReturnTokens_whenCredentialsAreCorrect() {
        User user = new User(
                "nhat@gmail.com",
                "$2a$10$encoded-password",
                "Trần Nhật",
                UserRole.CUSTOMER
        );

        LoginRequest request = new LoginRequest(
                " NHAT@gmail.com ",
                "Nhat12345"
        );

        when(
                userRepository.findByEmailIgnoreCase(
                        "nhat@gmail.com"
                )
        ).thenReturn(Optional.of(user));

        when(
                passwordEncoder.matches(
                        "Nhat12345",
                        user.getPasswordHash()
                )
        ).thenReturn(true);

        when(
                jwtService.generateAccessToken(user)
        ).thenReturn("access-token");

        when(
                jwtService.getExpirationSeconds()
        ).thenReturn(3600L);

        when(
                refreshTokenService.issue(user)
        ).thenReturn("refresh-token");

        AuthResponse response = authService.login(request);

        assertEquals(
                "access-token",
                response.accessToken()
        );

        assertEquals(
                "refresh-token",
                response.refreshToken()
        );

        assertEquals(
                "Bearer",
                response.tokenType()
        );

        assertEquals(
                3600L,
                response.expiresIn()
        );

        assertEquals(
                "Đăng nhập thành công",
                response.message()
        );

        verify(refreshTokenService).issue(user);
    }

    @Test
    void login_shouldThrow_whenPasswordIsIncorrect() {
        User user = new User(
                "nhat@gmail.com",
                "$2a$10$encoded-password",
                "Trần Nhật",
                UserRole.CUSTOMER
        );

        LoginRequest request = new LoginRequest(
                "nhat@gmail.com",
                "SaiMatKhau"
        );

        when(
                userRepository.findByEmailIgnoreCase(
                        "nhat@gmail.com"
                )
        ).thenReturn(Optional.of(user));

        when(
                passwordEncoder.matches(
                        "SaiMatKhau",
                        user.getPasswordHash()
                )
        ).thenReturn(false);

        InvalidCredentialsException exception =
                assertThrows(
                        InvalidCredentialsException.class,
                        () -> authService.login(request)
                );

        assertTrue(
                exception.getMessage()
                        .contains("không chính xác")
        );
    }

    @Test
    void login_shouldThrow_whenEmailDoesNotExist() {
        LoginRequest request = new LoginRequest(
                "missing@gmail.com",
                "Nhat12345"
        );

        when(
                userRepository.findByEmailIgnoreCase(
                        "missing@gmail.com"
                )
        ).thenReturn(Optional.empty());

        assertThrows(
                InvalidCredentialsException.class,
                () -> authService.login(request)
        );
    }
}