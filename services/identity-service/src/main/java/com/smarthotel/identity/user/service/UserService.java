package com.smarthotel.identity.user.service;

import com.smarthotel.identity.common.exception.CurrentPasswordInvalidException;
import com.smarthotel.identity.common.exception.UserNotFoundException;
import com.smarthotel.identity.common.response.MessageResponse;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.dto.ChangePasswordRequest;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;

    public UserService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            RefreshTokenService refreshTokenService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokenService = refreshTokenService;
    }

    @Transactional
    public MessageResponse changePassword(
            UUID userId,
            ChangePasswordRequest request
    ) {
        User user = userRepository
                .findById(userId)
                .orElseThrow(UserNotFoundException::new);

        if (!user.isActive()) {
            throw new UserNotFoundException();
        }

        boolean currentPasswordMatches =
                passwordEncoder.matches(
                        request.currentPassword(),
                        user.getPasswordHash()
                );

        if (!currentPasswordMatches) {
            throw new CurrentPasswordInvalidException();
        }

        boolean sameAsOldPassword =
                passwordEncoder.matches(
                        request.newPassword(),
                        user.getPasswordHash()
                );

        if (sameAsOldPassword) {
            throw new IllegalArgumentException(
                    "Mật khẩu mới phải khác mật khẩu hiện tại"
            );
        }

        user.changePassword(
                passwordEncoder.encode(
                        request.newPassword()
                )
        );

        /*
        * Thu hồi toàn bộ refresh token.
        * Người dùng phải đăng nhập lại trên mọi thiết bị.
        */
        refreshTokenService.revokeAllForUser(userId);

        return MessageResponse.success(
                "Đổi mật khẩu thành công. Vui lòng đăng nhập lại."
        );
    }
}