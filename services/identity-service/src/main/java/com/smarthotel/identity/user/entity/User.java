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
import java.util.Locale;
import java.util.UUID;

/**
 * Entity ánh xạ với bảng users trong PostgreSQL.
 */
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

    /**
     * Constructor dùng khi đăng ký tài khoản mới.
     */
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
    }

    /**
     * Chạy trước khi INSERT dữ liệu.
     */
    @PrePersist
    private void prePersist() {
        Instant now = Instant.now();

        if (id == null) {
            id = UUID.randomUUID();
        }

        createdAt = now;
        updatedAt = now;
    }

    /**
     * Chạy trước khi UPDATE dữ liệu.
     */
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
        this.active = true;
    }

    public void changePassword(String newPasswordHash) {
        this.passwordHash = newPasswordHash;
    }

    private static String normalizeEmail(String email) {
        if (email == null) {
            return null;
        }

        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeFullName(String fullName) {
        if (fullName == null) {
            return null;
        }

        return fullName.trim();
    }
}