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
            name = "email",
            nullable = false,
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

    public User(
            String email,
            String passwordHash,
            String fullName,
            UserRole role
    ) {
        this.email = normalizeEmail(email);
        this.passwordHash = passwordHash;
        this.fullName = normalizeFullName(fullName);
        this.role = role;
        this.emailVerified = false;
        this.active = true;
        this.deleted = false;
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

    private static String normalizeEmail(String email) {
        if (email == null) {
            return null;
        }

        return email
                .trim()
                .toLowerCase(Locale.ROOT);
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
