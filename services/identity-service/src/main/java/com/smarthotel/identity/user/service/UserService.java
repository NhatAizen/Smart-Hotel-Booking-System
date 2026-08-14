package com.smarthotel.identity.user.service;

import com.smarthotel.identity.common.exception.CurrentPasswordInvalidException;
import com.smarthotel.identity.common.exception.UserNotFoundException;
import com.smarthotel.identity.common.response.MessageResponse;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.dto.ChangePasswordRequest;
import com.smarthotel.identity.user.dto.PublicUserProfileResponse;
import com.smarthotel.identity.user.dto.UpdateProfileRequest;
import com.smarthotel.identity.user.dto.UserProfileResponse;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.media.ProfileMediaStorageService;
import com.smarthotel.identity.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final ProfileMediaStorageService profileMediaStorageService;

    public UserService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            RefreshTokenService refreshTokenService,
            ProfileMediaStorageService profileMediaStorageService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokenService = refreshTokenService;
        this.profileMediaStorageService = profileMediaStorageService;
    }

    @Transactional(readOnly = true)
    public UserProfileResponse getProfile(UUID userId) {
        return UserProfileResponse.from(findActiveUser(userId));
    }

    @Transactional(readOnly = true)
    public PublicUserProfileResponse getPublicProfile(UUID userId) {
        return PublicUserProfileResponse.from(findActiveUser(userId));
    }

    @Transactional
    public UserProfileResponse updateProfile(
            UUID userId,
            UpdateProfileRequest request
    ) {
        User user = findActiveUser(userId);

        user.updateProfile(
                request.fullName(),
                request.phone(),
                request.dateOfBirth(),
                request.gender(),
                request.nationality(),
                request.city(),
                request.address(),
                request.bio()
        );

        return UserProfileResponse.from(user);
    }

    @Transactional
    public UserProfileResponse updateAvatar(
            UUID userId,
            MultipartFile avatar
    ) {
        User user = findActiveUser(userId);
        String oldAvatarUrl = user.getAvatarUrl();
        String newAvatarUrl = profileMediaStorageService.storeAvatar(avatar);

        user.changeAvatar(newAvatarUrl);
        profileMediaStorageService.deleteByPublicUrl(oldAvatarUrl);

        return UserProfileResponse.from(user);
    }

    @Transactional
    public UserProfileResponse removeAvatar(UUID userId) {
        User user = findActiveUser(userId);
        String oldAvatarUrl = user.getAvatarUrl();

        user.changeAvatar(null);
        profileMediaStorageService.deleteByPublicUrl(oldAvatarUrl);

        return UserProfileResponse.from(user);
    }

    @Transactional
    public MessageResponse changePassword(
            UUID userId,
            ChangePasswordRequest request
    ) {
        User user = findActiveUser(userId);

        boolean currentPasswordMatches =
                passwordEncoder.matches(
                        request.currentPassword(),
                        user.getPasswordHash()
                );

        if (!currentPasswordMatches) {
            throw new CurrentPasswordInvalidException();
        }

        boolean sameAsOldPassword =
                passwordEncoder.matches(
                        request.newPassword(),
                        user.getPasswordHash()
                );

        if (sameAsOldPassword) {
            throw new IllegalArgumentException(
                    "Mật khẩu mới phải khác mật khẩu hiện tại"
            );
        }

        user.changePassword(
                passwordEncoder.encode(
                        request.newPassword()
                )
        );

        refreshTokenService.revokeAllForUser(userId);

        return MessageResponse.success(
                "Đổi mật khẩu thành công. Vui lòng đăng nhập lại."
        );
    }

    private User findActiveUser(UUID userId) {
        User user = userRepository
                .findById(userId)
                .orElseThrow(UserNotFoundException::new);

        if (!user.isActive()) {
            throw new UserNotFoundException();
        }

        return user;
    }
}
