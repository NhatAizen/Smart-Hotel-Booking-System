package com.smarthotel.identity.accounttoken.entity;

import com.smarthotel.identity.user.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "account_action_tokens")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AccountActionToken {

    @Id
    @Column(
            name = "id",
            nullable = false,
            updatable = false
    )
    private UUID id;

    @ManyToOne(
            fetch = FetchType.LAZY,
            optional = false
    )
    @JoinColumn(
            name = "user_id",
            nullable = false
    )
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(
            name = "token_type",
            nullable = false,
            length = 40
    )
    private AccountTokenType tokenType;

    @Column(
            name = "token_hash",
            nullable = false,
            unique = true,
            length = 64
    )
    private String tokenHash;

    @Column(
            name = "expires_at",
            nullable = false
    )
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(
            name = "created_at",
            nullable = false,
            updatable = false
    )
    private Instant createdAt;

    public AccountActionToken(
            User user,
            AccountTokenType tokenType,
            String tokenHash,
            Instant expiresAt
    ) {
        this.id = UUID.randomUUID();
        this.user = user;
        this.tokenType = tokenType;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.createdAt = Instant.now();
    }

    public boolean isUsableAt(Instant now) {
        return usedAt == null
                && expiresAt.isAfter(now);
    }

    public void markUsed(Instant now) {
        if (usedAt == null) {
            usedAt = now;
        }
    }
}