package com.smarthotel.identity.admin.service;

import com.smarthotel.identity.admin.dto.AdminUserResponse;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import com.smarthotel.identity.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminUserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RefreshTokenService refreshTokenService;

    @Test
    void lockUser_shouldDeactivateAndRevokeRefreshTokens() {
        UUID adminId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        User customer = new User(
                "customer@example.com",
                "encoded",
                "Customer",
                UserRole.CUSTOMER
        );

        when(userRepository.findById(customerId))
                .thenReturn(Optional.of(customer));

        AdminUserService service = new AdminUserService(
                userRepository,
                refreshTokenService
        );

        AdminUserResponse response = service.lockUser(
                adminId,
                customerId
        );

        assertFalse(customer.isActive());
        assertEquals("LOCKED", response.status());
        verify(refreshTokenService).revokeAllForUser(customer.getId());
    }

    @Test
    void lockUser_shouldRejectSelfLock() {
        UUID adminId = UUID.randomUUID();
        AdminUserService service = new AdminUserService(
                userRepository,
                refreshTokenService
        );

        assertThrows(
                IllegalArgumentException.class,
                () -> service.lockUser(adminId, adminId)
        );

        verify(userRepository, never()).findById(adminId);
    }

    @Test
    void unlockUser_shouldActivateAccount() {
        UUID userId = UUID.randomUUID();
        User user = new User(
                "user@example.com",
                "encoded",
                "User",
                UserRole.CUSTOMER
        );
        user.deactivate();

        when(userRepository.findById(userId))
                .thenReturn(Optional.of(user));

        AdminUserService service = new AdminUserService(
                userRepository,
                refreshTokenService
        );

        AdminUserResponse response = service.unlockUser(userId);

        assertTrue(user.isActive());
        assertEquals("ACTIVE", response.status());
    }
    @Test
    void deleteUser_shouldSoftDeleteAndRevokeRefreshTokens() {
        UUID adminId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        User customer = new User(
                "delete-me@example.com",
                "encoded",
                "Delete Me",
                UserRole.CUSTOMER
        );

        when(userRepository.findById(customerId))
                .thenReturn(Optional.of(customer));

        AdminUserService service = new AdminUserService(
                userRepository,
                refreshTokenService
        );

        AdminUserResponse response = service.deleteUser(adminId, customerId);

        assertTrue(customer.isDeleted());
        assertFalse(customer.isActive());
        assertEquals("DELETED", response.status());
        assertTrue(response.deleted());
        verify(refreshTokenService).revokeAllForUser(customer.getId());
    }

    @Test
    void deleteUser_shouldRejectSelfDelete() {
        UUID adminId = UUID.randomUUID();
        AdminUserService service = new AdminUserService(
                userRepository,
                refreshTokenService
        );

        assertThrows(
                IllegalArgumentException.class,
                () -> service.deleteUser(adminId, adminId)
        );

        verify(userRepository, never()).findById(adminId);
    }

    @Test
    void unlockUser_shouldRejectDeletedAccount() {
        UUID userId = UUID.randomUUID();
        User user = new User(
                "deleted@example.com",
                "encoded",
                "Deleted",
                UserRole.CUSTOMER
        );
        user.softDelete();

        when(userRepository.findById(userId))
                .thenReturn(Optional.of(user));

        AdminUserService service = new AdminUserService(
                userRepository,
                refreshTokenService
        );

        assertThrows(
                IllegalArgumentException.class,
                () -> service.unlockUser(userId)
        );
        assertTrue(user.isDeleted());
        assertFalse(user.isActive());
    }

}
