package com.smarthotel.identity.accounttoken.service;

import com.smarthotel.identity.accounttoken.entity.AccountTokenType;
import com.smarthotel.identity.accounttoken.repository.AccountActionTokenRepository;
import com.smarthotel.identity.common.exception.InvalidAccountTokenException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccountActionTokenServiceTest {

    @Mock
    private AccountActionTokenRepository tokenRepository;

    @Test
    void consume_shouldThrow_whenTokenDoesNotExist() {
        AccountActionTokenService service =
                new AccountActionTokenService(
                        tokenRepository
                );

        when(
                tokenRepository.findByTokenHashAndTokenType(
                        anyString(),
                        eq(AccountTokenType.PASSWORD_RESET)
                )
        ).thenReturn(Optional.empty());

        assertThrows(
                InvalidAccountTokenException.class,
                () -> service.consume(
                        "unknown-token",
                        AccountTokenType.PASSWORD_RESET
                )
        );
    }

    @Test
    void consume_shouldThrow_whenRawTokenIsBlank() {
        AccountActionTokenService service =
                new AccountActionTokenService(
                        tokenRepository
                );

        assertThrows(
                InvalidAccountTokenException.class,
                () -> service.consume(
                        " ",
                        AccountTokenType.EMAIL_VERIFICATION
                )
        );
    }
}