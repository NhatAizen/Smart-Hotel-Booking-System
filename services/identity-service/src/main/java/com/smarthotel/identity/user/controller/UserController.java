package com.smarthotel.identity.user.controller;

import com.smarthotel.identity.common.response.MessageResponse;
import com.smarthotel.identity.user.dto.ChangePasswordRequest;
import com.smarthotel.identity.user.dto.PublicUserProfileResponse;
import com.smarthotel.identity.user.dto.UpdateProfileRequest;
import com.smarthotel.identity.user.dto.UserProfileResponse;
import com.smarthotel.identity.user.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public UserProfileResponse getCurrentUser(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return userService.getProfile(userId(jwt));
    }

    /**
     * Endpoint nội bộ/public tối thiểu để các service khác hiển thị
     * tên + avatar hiện tại của tác giả review.
     */
    @GetMapping("/{userId}/public-profile")
    public PublicUserProfileResponse getPublicProfile(
            @PathVariable UUID userId
    ) {
        return userService.getPublicProfile(userId);
    }

    @PutMapping("/me")
    public UserProfileResponse updateCurrentUser(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        return userService.updateProfile(userId(jwt), request);
    }

    @PatchMapping(
            value = "/me/avatar",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public UserProfileResponse updateAvatar(
            @AuthenticationPrincipal Jwt jwt,
            @RequestPart("avatar") MultipartFile avatar
    ) {
        return userService.updateAvatar(userId(jwt), avatar);
    }

    @DeleteMapping("/me/avatar")
    public UserProfileResponse removeAvatar(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return userService.removeAvatar(userId(jwt));
    }

    @PutMapping("/me/password")
    public MessageResponse changePassword(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        return userService.changePassword(
                userId(jwt),
                request
        );
    }

    private UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
