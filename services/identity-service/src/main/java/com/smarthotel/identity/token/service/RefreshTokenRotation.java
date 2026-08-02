package com.smarthotel.identity.token.service;

import com.smarthotel.identity.user.entity.User;

public record RefreshTokenRotation(
        User user,
        String newRefreshToken
) {
}