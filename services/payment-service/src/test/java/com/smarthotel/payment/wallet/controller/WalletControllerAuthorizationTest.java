package com.smarthotel.payment.wallet.controller;

import com.smarthotel.payment.payment.service.PaymentService;
import com.smarthotel.payment.wallet.dto.WithdrawalMedia;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.service.WalletService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WalletControllerAuthorizationTest {
    private WalletService walletService;
    private WalletController controller;

    @BeforeEach
    void setUp() {
        walletService = mock(WalletService.class);
        controller = new WalletController(walletService, mock(PaymentService.class));
    }

    @Test
    void customerWithdrawalHistoryIsScopedByJwtSubjectAndCustomerOwnerType() {
        UUID subject = UUID.randomUUID();
        when(walletService.getMyWithdrawals(subject, WalletOwnerType.CUSTOMER))
                .thenReturn(List.of());

        controller.myWithdrawals(jwt(subject, "CUSTOMER"));

        verify(walletService).getMyWithdrawals(subject, WalletOwnerType.CUSTOMER);
    }

    @Test
    void hotelAdminCannotBeRoutedToCustomerWithdrawalHistoryForSameSubjectId() {
        UUID subject = UUID.randomUUID();
        when(walletService.getMyWithdrawals(subject, WalletOwnerType.HOTEL_ADMIN))
                .thenReturn(List.of());

        controller.myWithdrawals(jwt(subject, "HOTEL_ADMIN"));

        verify(walletService).getMyWithdrawals(subject, WalletOwnerType.HOTEL_ADMIN);
    }

    @Test
    void withdrawalMediaAuthorizationReceivesJwtOwnerType() {
        UUID subject = UUID.randomUUID();
        UUID withdrawalId = UUID.randomUUID();
        when(walletService.getTransferProof(
                withdrawalId, subject, WalletOwnerType.CUSTOMER, false
        )).thenReturn(new WithdrawalMedia(new byte[]{1}, "image/png", "proof.png"));

        controller.transferProof(jwt(subject, "CUSTOMER"), withdrawalId);

        verify(walletService).getTransferProof(
                withdrawalId, subject, WalletOwnerType.CUSTOMER, false
        );
    }

    @Test
    void systemAdminMediaAccessUsesExplicitAdminBypassWithoutForgedOwnerType() {
        UUID subject = UUID.randomUUID();
        UUID withdrawalId = UUID.randomUUID();
        when(walletService.getReceiverQr(withdrawalId, subject, null, true))
                .thenReturn(new WithdrawalMedia(new byte[]{1}, "image/png", "receiver.png"));

        controller.receiverQr(jwt(subject, "SYSTEM_ADMIN"), withdrawalId);

        verify(walletService).getReceiverQr(withdrawalId, subject, null, true);
    }

    private Jwt jwt(UUID subject, String role) {
        return Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .subject(subject.toString())
                .claim("role", role)
                .build();
    }
}
