package com.smarthotel.identity.rolechange.dto;

import java.util.UUID;

public record CurrentRoleResponse(
        UUID userId,
        String role,
        boolean active,
        boolean roleTransitionInProgress,
        UUID roleTransitionId
) {
}
