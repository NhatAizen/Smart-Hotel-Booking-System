package com.smarthotel.identity.auth.dto;

import com.smarthotel.identity.user.entity.User;

import java.util.UUID;

public record AuthResponse(

        UUID userId,
        String email,
        String fullName,
        String role,
        boolean emailVerified,

        String accessToken,
        String refreshToken,
        String tokenType,
        Long expiresIn,

        String message

) {

    public static AuthResponse registered(User user) {
        return new AuthResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole().name(),
                user.isEmailVerified(),
                null,
                null,
                null,
                null,
                "Đăng ký tài khoản thành công"
        );
    }

    public static AuthResponse loggedIn(
            User user,
            String accessToken,
            String refreshToken,
            long expiresIn
    ) {
        return new AuthResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole().name(),
                user.isEmailVerified(),
                accessToken,
                refreshToken,
                "Bearer",
                expiresIn,
                "Đăng nhập thành công"
        );
    }

    public static AuthResponse refreshed(
            User user,
            String accessToken,
            String refreshToken,
            long expiresIn
    ) {
        return new AuthResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole().name(),
                user.isEmailVerified(),
                accessToken,
                refreshToken,
                "Bearer",
                expiresIn,
                "Làm mới token thành công"
        );
    }
}