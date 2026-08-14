package com.smarthotel.identity.user.dto;

import com.smarthotel.identity.user.entity.User;

import java.util.UUID;

/**
 * Hồ sơ công khai tối thiểu dùng giữa các service.
 * Không trả email, số điện thoại, địa chỉ hay dữ liệu nhạy cảm.
 */
public record PublicUserProfileResponse(
        UUID userId,
        String fullName,
        String avatarUrl
) {
    public static PublicUserProfileResponse from(User user) {
        return new PublicUserProfileResponse(
                user.getId(),
                user.getFullName(),
                user.getAvatarUrl()
        );
    }
}
