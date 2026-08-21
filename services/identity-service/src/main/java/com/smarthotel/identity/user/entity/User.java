package com.smarthotel.identity.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Locale;
import java.util.UUID;

@Getter
@Entity
@Table(name = "users")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(
            name = "username",
            nullable = false,
            length = 30
    )
    private String username;

    @Column(
            name = "email",
            unique = true,
            length = 255
    )
    private String email;

    @Column(
            name = "password_hash",
            nullable = false,
            length = 255
    )
    private String passwordHash;

    @Column(
            name = "full_name",
            nullable = false,
            length = 150
    )
    private String fullName;

    @Enumerated(EnumType.STRING)
    @Column(
            name = "role",
            nullable = false,
            length = 30
    )
    private UserRole role;

    @Column(
            name = "email_verified",
            nullable = false
    )
    private boolean emailVerified;

    @Column(
            name = "active",
            nullable = false
    )
    private boolean active;

    @Column(
            name = "deleted",
            nullable = false
    )
    private boolean deleted;

    @Column(
            name = "role_transition_in_progress",
            nullable = false
    )
    private boolean roleTransitionInProgress;

    @Column(name = "role_transition_id")
    private UUID roleTransitionId;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(
            name = "created_at",
            nullable = false,
            updatable = false
    )
    private Instant createdAt;

    @Column(
            name = "updated_at",
            nullable = false
    )
    private Instant updatedAt;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(name = "gender", length = 20)
    private String gender;

    @Column(name = "nationality", length = 80)
    private String nationality;

    @Column(name = "city", length = 100)
    private String city;

    @Column(name = "address", length = 255)
    private String address;

    @Column(name = "bio", length = 500)
    private String bio;

    @Column(name = "avatar_url", length = 1000)
    private String avatarUrl;

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts;

    @Column(name = "login_lock_level", nullable = false)
    private int loginLockLevel;

    @Column(name = "login_lock_until")
    private Instant loginLockUntil;

    @Column(name = "last_failed_login_at")
    private Instant lastFailedLoginAt;

    public User(
            String username,
            String email,
            String passwordHash,
            String fullName,
            UserRole role
    ) {
        this.username = normalizeUsername(username);
        this.email = normalizeEmail(email);
        this.passwordHash = passwordHash;
        this.fullName = normalizeFullName(fullName);
        this.role = role;
        this.emailVerified = false;
        this.active = true;
        this.deleted = false;
        this.failedLoginAttempts = 0;
        this.loginLockLevel = 0;
    }

    public User(
            String email,
            String passwordHash,
            String fullName,
            UserRole role
    ) {
        this(
                "user_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12),
                email,
                passwordHash,
                fullName,
                role
        );
    }

    @PrePersist
    private void prePersist() {
        Instant now = Instant.now();

        if (id == null) {
            id = UUID.randomUUID();
        }

        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    private void preUpdate() {
        updatedAt = Instant.now();
    }

    public void verifyEmail() {
        this.emailVerified = true;
    }

    public void deactivate() {
        this.active = false;
    }

    public void activate() {
        if (this.deleted) {
            throw new IllegalStateException("Tài khoản đã bị xóa và không thể mở khóa");
        }
        this.active = true;
    }

    public void softDelete() {
        if (this.deleted) {
            return;
        }
        this.deleted = true;
        this.deletedAt = Instant.now();
        this.active = false;
    }

    public void changePassword(String newPasswordHash) {
        if (newPasswordHash == null || newPasswordHash.isBlank()) {
            throw new IllegalArgumentException(
                    "MÃ¡ÂºÂ­t khÃ¡ÂºÂ©u mÃƒÂ£ hÃƒÂ³a khÃƒÂ´ng Ã„â€˜Ã†Â°Ã¡Â»Â£c Ã„â€˜Ã¡Â»Æ’ trÃ¡Â»â€˜ng"
            );
        }

        this.passwordHash = newPasswordHash;
    }


    public boolean isLoginTemporarilyLocked(Instant now) {
        return loginLockUntil != null && now.isBefore(loginLockUntil);
    }

    public long getRemainingLoginLockSeconds(Instant now) {
        if (!isLoginTemporarilyLocked(now)) {
            return 0;
        }

        long millis = loginLockUntil.toEpochMilli() - now.toEpochMilli();
        return Math.max(1, (millis + 999) / 1000);
    }

    /**
     * Ghi nhận một lần đăng nhập sai. Sau mỗi 5 lần sai liên tiếp,
     * tài khoản bị khóa tạm thời theo các mốc 1, 2, 5, 15 và 30 phút.
     */
    public long recordFailedLogin(Instant now) {
        if (loginLockUntil != null && !now.isBefore(loginLockUntil)) {
            loginLockUntil = null;
        }

        this.failedLoginAttempts += 1;
        this.lastFailedLoginAt = now;

        if (this.failedLoginAttempts < 5) {
            return 0;
        }

        long[] lockDurationsSeconds = {60, 120, 300, 900, 1800};
        int durationIndex = Math.min(this.loginLockLevel, lockDurationsSeconds.length - 1);
        long duration = lockDurationsSeconds[durationIndex];

        this.failedLoginAttempts = 0;
        this.loginLockLevel = Math.min(this.loginLockLevel + 1, lockDurationsSeconds.length - 1);
        this.loginLockUntil = now.plusSeconds(duration);
        return duration;
    }

    public void clearLoginFailures() {
        this.failedLoginAttempts = 0;
        this.loginLockLevel = 0;
        this.loginLockUntil = null;
        this.lastFailedLoginAt = null;
    }

    public void updateProfile(
            String fullName,
            String phone,
            LocalDate dateOfBirth,
            String gender,
            String nationality,
            String city,
            String address,
            String bio
    ) {
        String normalizedName = normalizeFullName(fullName);
        if (normalizedName == null || normalizedName.isBlank()) {
            throw new IllegalArgumentException("Họ và tên không được để trống");
        }

        if (dateOfBirth != null && dateOfBirth.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("Ngày sinh không thể ở tương lai");
        }

        this.fullName = normalizedName;
        this.phone = normalizeNullable(phone);
        this.dateOfBirth = dateOfBirth;
        this.gender = normalizeNullable(gender);
        this.nationality = normalizeNullable(nationality);
        this.city = normalizeNullable(city);
        this.address = normalizeNullable(address);
        this.bio = normalizeNullable(bio);
    }

    public void changeAvatar(String avatarUrl) {
        this.avatarUrl = normalizeNullable(avatarUrl);
    }

    public void promoteToHotelAdmin() {
        if (this.role == UserRole.SYSTEM_ADMIN) {
            throw new IllegalStateException(
                    "KhÃƒÂ´ng thÃ¡Â»Æ’ thay Ã„â€˜Ã¡Â»â€¢i quyÃ¡Â»Ân cÃ¡Â»Â§a System Admin"
            );
        }

        if (this.role == UserRole.HOTEL_ADMIN) {
            throw new IllegalStateException(
                    "TÃƒÂ i khoÃ¡ÂºÂ£n Ã„â€˜ÃƒÂ£ lÃƒÂ  Hotel Admin"
            );
        }

        this.role = UserRole.HOTEL_ADMIN;
    }

    public UUID beginHotelAdminDemotion() {
        if (this.role != UserRole.HOTEL_ADMIN) {
            throw new IllegalStateException(
                    "Only a Hotel Admin can start a demotion transition"
            );
        }
        if (this.roleTransitionInProgress) {
            if (this.roleTransitionId == null) {
                throw new IllegalStateException(
                        "The role transition is missing its transition identifier"
                );
            }
            return this.roleTransitionId;
        }

        this.roleTransitionId = UUID.randomUUID();
        this.roleTransitionInProgress = true;
        return this.roleTransitionId;
    }

    public void finishRoleTransition(UUID transitionId) {
        if (!this.roleTransitionInProgress
                || this.roleTransitionId == null
                || !this.roleTransitionId.equals(transitionId)) {
            throw new IllegalStateException("The role transition is no longer current");
        }
        this.roleTransitionInProgress = false;
    }

    public void clearCompletedRoleTransition(UUID transitionId) {
        if (this.roleTransitionInProgress
                || this.roleTransitionId == null
                || !this.roleTransitionId.equals(transitionId)) {
            throw new IllegalStateException("The completed role transition is no longer current");
        }
        this.roleTransitionId = null;
    }

    private static String normalizeUsername(String username) {
        if (username == null) {
            return null;
        }
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeEmail(String email) {
        if (email == null) {
            return null;
        }

        String normalized = email.trim().toLowerCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }


    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static String normalizeFullName(String fullName) {
        if (fullName == null) {
            return null;
        }

        return fullName.trim();
    }
}
