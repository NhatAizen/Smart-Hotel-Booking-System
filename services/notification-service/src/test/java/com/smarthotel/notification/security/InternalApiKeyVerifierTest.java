package com.smarthotel.notification.security;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class InternalApiKeyVerifierTest {
    private final InternalApiKeyVerifier verifier =
            new InternalApiKeyVerifier("a-test-internal-key-that-is-not-secret");

    @Test
    void acceptsExactKey() {
        assertDoesNotThrow(() -> verifier.verify("a-test-internal-key-that-is-not-secret"));
    }

    @Test
    void rejectsMissingOrDifferentKey() {
        assertThrows(AccessDeniedException.class, () -> verifier.verify(null));
        assertThrows(AccessDeniedException.class, () -> verifier.verify("different"));
    }
}
