package com.smarthotel.identity.admin.dto;

import com.smarthotel.identity.user.entity.User;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record AdminUserResponse(
        UUID id,
        String email,
        String fullName,
        String role,
        String status,
        boolean active,
        boolean deleted,
        Instant deletedAt,
        boolean emailVerified,
        Instant createdAt,
        Instant updatedAt,
        String phone,
        LocalDate dateOfBirth,
        String gender,
        String nationality,
        String city,
        String address,
        String bio,
        String avatarUrl
) {

    public static AdminUserResponse from(User user) {
        return new AdminUserResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole().name(),
                user.isDeleted() ? "DELETED" : (user.isActive() ? "ACTIVE" : "LOCKED"),
                user.isActive(),
                user.isDeleted(),
                user.getDeletedAt(),
                user.isEmailVerified(),
                user.getCreatedAt(),
                user.getUpdatedAt(),
                user.getPhone(),
                user.getDateOfBirth(),
                user.getGender(),
                user.getNationality(),
                user.getCity(),
                user.getAddress(),
                user.getBio(),
                user.getAvatarUrl()
        );
    }
}
