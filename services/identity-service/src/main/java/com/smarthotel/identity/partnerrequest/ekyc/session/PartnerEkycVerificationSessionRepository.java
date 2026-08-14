package com.smarthotel.identity.partnerrequest.ekyc.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;

public interface PartnerEkycVerificationSessionRepository
        extends JpaRepository<PartnerEkycVerificationSession, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PartnerEkycVerificationSession> findByUserIdAndReceiptTokenHash(
            UUID userId,
            String receiptTokenHash
    );
}
