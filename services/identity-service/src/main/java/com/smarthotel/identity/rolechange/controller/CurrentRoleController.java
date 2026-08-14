package com.smarthotel.identity.rolechange.controller;

import com.smarthotel.identity.common.exception.UserNotFoundException;
import com.smarthotel.identity.rolechange.dto.CurrentRoleResponse;
import com.smarthotel.identity.rolechange.repository.RoleChangeUserRepository;
import com.smarthotel.identity.user.entity.User;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/me")
public class CurrentRoleController {

    private final RoleChangeUserRepository userRepository;

    public CurrentRoleController(RoleChangeUserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/role-snapshot")
    public CurrentRoleResponse currentRole(@AuthenticationPrincipal Jwt jwt) {
        User user = userRepository.findById(
                AdminRoleChangeController.currentUserId(jwt)
        ).orElseThrow(UserNotFoundException::new);

        return new CurrentRoleResponse(
                user.getId(),
                user.getRole().name(),
                user.isActive() && !user.isDeleted(),
                user.isRoleTransitionInProgress(),
                user.getRoleTransitionId()
        );
    }
}
