package com.smarthotel.identity.user.dto;

import com.smarthotel.identity.user.entity.User;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record UserProfileResponse(
        UUID userId,
        String email,
        String fullName,
        String role,
        boolean emailVerified,
        String phone,
        LocalDate dateOfBirth,
        String gender,
        String nationality,
        String city,
        String address,
        String bio,
        String avatarUrl,
        Instant createdAt,
        Instant updatedAt
) {
    public static UserProfileResponse from(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole().name(),
                user.isEmailVerified(),
                user.getPhone(),
                user.getDateOfBirth(),
                user.getGender(),
                user.getNationality(),
                user.getCity(),
                user.getAddress(),
                user.getBio(),
                user.getAvatarUrl(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }
}
