package com.smarthotel.identity.rolechange.dto;

import com.smarthotel.identity.user.entity.User;

import java.time.Instant;
import java.util.UUID;

public record RoleChangeUserResponse(
        UUID id,
        String email,
        String fullName,
        String role,
        String status,
        boolean active,
        Instant updatedAt
) {
    public static RoleChangeUserResponse from(User user) {
        return new RoleChangeUserResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole().name(),
                user.isDeleted() ? "DELETED" : (user.isActive() ? "ACTIVE" : "LOCKED"),
                user.isActive(),
                user.getUpdatedAt()
        );
    }
}
