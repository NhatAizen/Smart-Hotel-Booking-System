package com.smarthotel.identity.admin.controller;

import com.smarthotel.identity.admin.dto.AdminUserResponse;
import com.smarthotel.identity.admin.service.AdminUserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @GetMapping
    public List<AdminUserResponse> getUsers(
            @RequestParam(defaultValue = "false") boolean includeDeleted
    ) {
        return adminUserService.getUsers(includeDeleted);
    }

    @GetMapping("/{userId}")
    public AdminUserResponse getUser(@PathVariable UUID userId) {
        return adminUserService.getUser(userId);
    }

    @PatchMapping("/{userId}/lock")
    public AdminUserResponse lockUser(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID userId
    ) {
        UUID currentAdminId = UUID.fromString(jwt.getSubject());
        return adminUserService.lockUser(currentAdminId, userId);
    }

    @PatchMapping("/{userId}/unlock")
    public AdminUserResponse unlockUser(@PathVariable UUID userId) {
        return adminUserService.unlockUser(userId);
    }

    @DeleteMapping("/{userId}")
    public AdminUserResponse deleteUser(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID userId
    ) {
        UUID currentAdminId = UUID.fromString(jwt.getSubject());
        return adminUserService.deleteUser(currentAdminId, userId);
    }
}
