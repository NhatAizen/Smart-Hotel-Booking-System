package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.wallet.entity.Wallet;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.repository.RoleChangeFinancialQueryRepository;
import com.smarthotel.payment.wallet.repository.WalletRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RoleChangePaymentEligibilityServiceTest {

    @Mock WalletRepository walletRepository;
    @Mock RoleChangeFinancialQueryRepository financialQueryRepository;

    @InjectMocks RoleChangePaymentEligibilityService eligibilityService;

    @Test
    void missingWalletAndNoOpenOperationsIsEligible() {
        UUID ownerId = UUID.randomUUID();
        when(walletRepository.findByOwnerTypeAndOwnerId(
                WalletOwnerType.HOTEL_ADMIN,
                ownerId
        )).thenReturn(Optional.empty());

        var response = eligibilityService.getEligibility(ownerId);

        assertThat(response.eligible()).isTrue();
        assertThat(response.availableBalance()).isEqualByComparingTo("0.00");
        assertThat(response.pendingBalance()).isEqualByComparingTo("0.00");
        assertThat(response.lockedBalance()).isEqualByComparingTo("0.00");
        assertThat(response.commissionDebt()).isEqualByComparingTo("0.00");
        assertThat(response.blockers()).isEmpty();
    }

    @Test
    void everyOutstandingFinancialCategoryBlocksRoleChange() {
        UUID ownerId = UUID.randomUUID();
        Wallet wallet = new Wallet(WalletOwnerType.HOTEL_ADMIN, ownerId);
        wallet.creditAvailable(new BigDecimal("200.00"));
        wallet.creditPending(new BigDecimal("50.00"));
        wallet.holdForWithdrawal(new BigDecimal("20.00"));
        wallet.chargeCommission(new BigDecimal("200.00"));
        wallet.creditAvailable(new BigDecimal("30.00"));

        when(walletRepository.findByOwnerTypeAndOwnerId(
                WalletOwnerType.HOTEL_ADMIN,
                ownerId
        )).thenReturn(Optional.of(wallet));
        when(financialQueryRepository.countOpenWithdrawals(ownerId)).thenReturn(1L);
        when(financialQueryRepository.countPendingPayments(ownerId)).thenReturn(2L);
        when(financialQueryRepository.countUnsettledPaidPayments(ownerId)).thenReturn(3L);
        when(financialQueryRepository.countOpenWalletTopUps(ownerId)).thenReturn(4L);

        var response = eligibilityService.getEligibility(ownerId);

        assertThat(response.eligible()).isFalse();
        assertThat(response.openWithdrawalCount()).isEqualTo(1);
        assertThat(response.pendingPaymentCount()).isEqualTo(2);
        assertThat(response.unsettledPaymentCount()).isEqualTo(3);
        assertThat(response.openWalletTopUpCount()).isEqualTo(4);
        assertThat(response.availableBalance()).isNotZero();
        assertThat(response.pendingBalance()).isNotZero();
        assertThat(response.lockedBalance()).isNotZero();
        assertThat(response.commissionDebt()).isNotZero();
        assertThat(response.blockers()).hasSize(8);
    }
}
