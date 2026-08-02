package com.smarthotel.identity.accounttoken.repository;

import com.smarthotel.identity.accounttoken.entity.AccountActionToken;
import com.smarthotel.identity.accounttoken.entity.AccountTokenType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface AccountActionTokenRepository
        extends JpaRepository<AccountActionToken, UUID> {

    Optional<AccountActionToken>
    findByTokenHashAndTokenType(
            String tokenHash,
            AccountTokenType tokenType
    );

    @Modifying
    @Query("""
            update AccountActionToken token
               set token.usedAt = :usedAt
             where token.user.id = :userId
               and token.tokenType = :tokenType
               and token.usedAt is null
            """)
    int invalidateActiveTokens(
            @Param("userId") UUID userId,
            @Param("tokenType") AccountTokenType tokenType,
            @Param("usedAt") Instant usedAt
    );
}