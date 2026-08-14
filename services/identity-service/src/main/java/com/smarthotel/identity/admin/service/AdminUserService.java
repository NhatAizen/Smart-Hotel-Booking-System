package com.smarthotel.identity.admin.service;

import com.smarthotel.identity.admin.dto.AdminUserResponse;
import com.smarthotel.identity.common.exception.UserNotFoundException;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import com.smarthotel.identity.user.repository.UserRepository;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class AdminUserService {

    private final UserRepository userRepository;
    private final RefreshTokenService refreshTokenService;

    public AdminUserService(
            UserRepository userRepository,
            RefreshTokenService refreshTokenService
    ) {
        this.userRepository = userRepository;
        this.refreshTokenService = refreshTokenService;
    }

    @Transactional(readOnly = true)
    public List<AdminUserResponse> getUsers(boolean includeDeleted) {
        return userRepository
                .findAll(Sort.by(Sort.Direction.DESC, "createdAt"))
                .stream()
                .filter(user -> includeDeleted || !user.isDeleted())
                .map(AdminUserResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public AdminUserResponse getUser(UUID userId) {
        return AdminUserResponse.from(findUser(userId));
    }

    @Transactional
    public AdminUserResponse lockUser(UUID currentAdminId, UUID userId) {
        if (currentAdminId.equals(userId)) {
            throw new IllegalArgumentException(
                    "Bạn không thể khóa chính tài khoản System Admin đang đăng nhập"
            );
        }

        User user = findUser(userId);

        if (user.isDeleted()) {
            throw new IllegalArgumentException("Tài khoản đã bị xóa, không thể khóa");
        }

        if (!user.isActive()) {
            return AdminUserResponse.from(user);
        }

        if (
                user.getRole() == UserRole.SYSTEM_ADMIN
                        && userRepository.countByRoleAndActiveTrue(
                        UserRole.SYSTEM_ADMIN
                ) <= 1
        ) {
            throw new IllegalArgumentException(
                    "Không thể khóa System Admin hoạt động cuối cùng của hệ thống"
            );
        }

        user.deactivate();

        // Không cho tài khoản bị khóa tiếp tục tạo access token mới.
        refreshTokenService.revokeAllForUser(user.getId());

        return AdminUserResponse.from(user);
    }

    @Transactional
    public AdminUserResponse unlockUser(UUID userId) {
        User user = findUser(userId);

        if (user.isDeleted()) {
            throw new IllegalArgumentException("Tài khoản đã bị xóa và không thể mở khóa");
        }

        if (!user.isActive()) {
            user.activate();
        }

        return AdminUserResponse.from(user);
    }

    @Transactional
    public AdminUserResponse deleteUser(UUID currentAdminId, UUID userId) {
        if (currentAdminId.equals(userId)) {
            throw new IllegalArgumentException(
                    "Bạn không thể xóa chính tài khoản System Admin đang đăng nhập"
            );
        }

        User user = findUser(userId);

        if (user.isDeleted()) {
            return AdminUserResponse.from(user);
        }

        if (
                user.getRole() == UserRole.SYSTEM_ADMIN
                        && user.isActive()
                        && userRepository.countByRoleAndActiveTrue(UserRole.SYSTEM_ADMIN) <= 1
        ) {
            throw new IllegalArgumentException(
                    "Không thể xóa System Admin hoạt động cuối cùng của hệ thống"
            );
        }

        user.softDelete();
        refreshTokenService.revokeAllForUser(user.getId());

        return AdminUserResponse.from(user);
    }

    private User findUser(UUID userId) {
        return userRepository
                .findById(userId)
                .orElseThrow(UserNotFoundException::new);
    }
}
