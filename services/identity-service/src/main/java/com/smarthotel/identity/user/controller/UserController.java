package com.smarthotel.identity.user.controller;

import com.smarthotel.identity.common.response.MessageResponse;
import com.smarthotel.identity.user.dto.ChangePasswordRequest;
import com.smarthotel.identity.user.service.UserService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public Map<String, Object> getCurrentUser(
            @AuthenticationPrincipal Jwt jwt
    ) {
        Map<String, Object> response = new LinkedHashMap<>();

        response.put("userId", jwt.getSubject());
        response.put("email", jwt.getClaimAsString("email"));
        response.put(
                "fullName",
                jwt.getClaimAsString("fullName")
        );
        response.put("role", jwt.getClaimAsString("role"));
        response.put(
                "emailVerified",
                jwt.getClaimAsBoolean("emailVerified")
        );

        return response;
    }

    @PutMapping("/me/password")
    public MessageResponse changePassword(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        UUID userId = UUID.fromString(jwt.getSubject());

        return userService.changePassword(
                userId,
                request
        );
    }
}