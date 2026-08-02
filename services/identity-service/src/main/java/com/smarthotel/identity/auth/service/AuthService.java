package com.smarthotel.identity.auth.service;

import com.smarthotel.identity.accounttoken.entity.AccountTokenType;
import com.smarthotel.identity.accounttoken.service.AccountActionTokenService;
import com.smarthotel.identity.auth.dto.AuthResponse;
import com.smarthotel.identity.auth.dto.EmailRequest;
import com.smarthotel.identity.auth.dto.LoginRequest;
import com.smarthotel.identity.auth.dto.RefreshTokenRequest;
import com.smarthotel.identity.auth.dto.RegisterRequest;
import com.smarthotel.identity.auth.dto.ResetPasswordRequest;
import com.smarthotel.identity.common.exception.EmailAlreadyExistsException;
import com.smarthotel.identity.common.exception.InvalidCredentialsException;
import com.smarthotel.identity.common.response.MessageResponse;
import com.smarthotel.identity.mail.AppMailProperties;
import com.smarthotel.identity.mail.MailService;
import com.smarthotel.identity.security.JwtService;
import com.smarthotel.identity.token.service.RefreshTokenRotation;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import com.smarthotel.identity.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final AccountActionTokenService accountTokenService;
    private final MailService mailService;
    private final AppMailProperties mailProperties;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            RefreshTokenService refreshTokenService,
            AccountActionTokenService accountTokenService,
            MailService mailService,
            AppMailProperties mailProperties
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.accountTokenService = accountTokenService;
        this.mailService = mailService;
        this.mailProperties = mailProperties;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String normalizedEmail =
                normalizeEmail(request.email());

        if (userRepository
                .existsByEmailIgnoreCase(normalizedEmail)) {
            throw new EmailAlreadyExistsException(
                    normalizedEmail
            );
        }

        User user = new User(
                normalizedEmail,
                passwordEncoder.encode(request.password()),
                request.fullName(),
                UserRole.CUSTOMER
        );

        User savedUser = userRepository.save(user);

        String verificationToken =
                accountTokenService.issue(
                        savedUser,
                        AccountTokenType.EMAIL_VERIFICATION,
                        mailProperties
                                .verificationExpirationSeconds()
                );

        mailService.sendVerificationEmail(
                savedUser,
                verificationToken
        );

        return AuthResponse.registered(savedUser);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        String normalizedEmail =
                normalizeEmail(request.email());

        User user = userRepository
                .findByEmailIgnoreCase(normalizedEmail)
                .orElseThrow(
                        InvalidCredentialsException::new
                );

        boolean passwordMatches =
                passwordEncoder.matches(
                        request.password(),
                        user.getPasswordHash()
                );

        if (!passwordMatches || !user.isActive()) {
            throw new InvalidCredentialsException();
        }

        String accessToken =
                jwtService.generateAccessToken(user);

        String refreshToken =
                refreshTokenService.issue(user);

        return AuthResponse.loggedIn(
                user,
                accessToken,
                refreshToken,
                jwtService.getExpirationSeconds()
        );
    }

    @Transactional
    public AuthResponse refresh(
            RefreshTokenRequest request
    ) {
        RefreshTokenRotation rotation =
                refreshTokenService.rotate(
                        request.refreshToken()
                );

        String accessToken =
                jwtService.generateAccessToken(
                        rotation.user()
                );

        return AuthResponse.refreshed(
                rotation.user(),
                accessToken,
                rotation.newRefreshToken(),
                jwtService.getExpirationSeconds()
        );
    }

    @Transactional
    public MessageResponse logout(
            RefreshTokenRequest request
    ) {
        refreshTokenService.revoke(
                request.refreshToken()
        );

        return MessageResponse.success(
                "Đăng xuất thành công"
        );
    }

    @Transactional
    public MessageResponse logoutAll(UUID userId) {
        refreshTokenService.revokeAllForUser(userId);

        return MessageResponse.success(
                "Đã đăng xuất khỏi tất cả thiết bị"
        );
    }

    @Transactional
    public MessageResponse verifyEmail(String rawToken) {
        User user = accountTokenService.consume(
                rawToken,
                AccountTokenType.EMAIL_VERIFICATION
        );

        if (!user.isEmailVerified()) {
            user.verifyEmail();

            /*
             * Token JWT cũ vẫn chứa emailVerified=false.
             * Thu hồi refresh token để user đăng nhập lại
             * và nhận JWT có claim mới.
             */
            refreshTokenService.revokeAllForUser(
                    user.getId()
            );
        }

        return MessageResponse.success(
                "Xác thực email thành công"
        );
    }

    @Transactional
    public MessageResponse resendVerification(
            EmailRequest request
    ) {
        String normalizedEmail =
                normalizeEmail(request.email());

        userRepository
                .findByEmailIgnoreCase(normalizedEmail)
                .filter(User::isActive)
                .filter(user -> !user.isEmailVerified())
                .ifPresent(user -> {
                    String rawToken =
                            accountTokenService.issue(
                                    user,
                                    AccountTokenType
                                            .EMAIL_VERIFICATION,
                                    mailProperties
                                            .verificationExpirationSeconds()
                            );

                    mailService.sendVerificationEmail(
                            user,
                            rawToken
                    );
                });

        /*
         * Luôn trả cùng response để không làm lộ
         * email có tồn tại trong hệ thống hay không.
         */
        return MessageResponse.success(
                "Nếu tài khoản tồn tại và chưa xác thực, email xác thực đã được gửi"
        );
    }

    @Transactional
    public MessageResponse forgotPassword(
            EmailRequest request
    ) {
        String normalizedEmail =
                normalizeEmail(request.email());

        userRepository
                .findByEmailIgnoreCase(normalizedEmail)
                .filter(User::isActive)
                .ifPresent(user -> {
                    String rawToken =
                            accountTokenService.issue(
                                    user,
                                    AccountTokenType
                                            .PASSWORD_RESET,
                                    mailProperties
                                            .passwordResetExpirationSeconds()
                            );

                    mailService.sendPasswordResetEmail(
                            user,
                            rawToken
                    );
                });

        /*
         * Tránh email enumeration.
         */
        return MessageResponse.success(
                "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi"
        );
    }

    @Transactional
    public MessageResponse resetPassword(
            ResetPasswordRequest request
    ) {
        User user = accountTokenService.consume(
                request.token(),
                AccountTokenType.PASSWORD_RESET
        );

        boolean sameAsCurrentPassword =
                passwordEncoder.matches(
                        request.newPassword(),
                        user.getPasswordHash()
                );

        if (sameAsCurrentPassword) {
            throw new IllegalArgumentException(
                    "Mật khẩu mới phải khác mật khẩu hiện tại"
            );
        }

        user.changePassword(
                passwordEncoder.encode(
                        request.newPassword()
                )
        );

        refreshTokenService.revokeAllForUser(
                user.getId()
        );

        accountTokenService.invalidateAll(
                user,
                AccountTokenType.EMAIL_VERIFICATION
        );

        return MessageResponse.success(
                "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại."
        );
    }

    private String normalizeEmail(String email) {
        return email
                .trim()
                .toLowerCase(Locale.ROOT);
    }
}