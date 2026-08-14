package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.wallet.dto.RoleChangePaymentEligibilityResponse;
import com.smarthotel.payment.wallet.entity.Wallet;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.repository.RoleChangeFinancialQueryRepository;
import com.smarthotel.payment.wallet.repository.WalletRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class RoleChangePaymentEligibilityService {

    private final WalletRepository walletRepository;
    private final RoleChangeFinancialQueryRepository financialQueryRepository;

    public RoleChangePaymentEligibilityService(
            WalletRepository walletRepository,
            RoleChangeFinancialQueryRepository financialQueryRepository
    ) {
        this.walletRepository = walletRepository;
        this.financialQueryRepository = financialQueryRepository;
    }

    @Transactional(readOnly = true)
    public RoleChangePaymentEligibilityResponse getEligibility(UUID ownerId) {
        Wallet wallet = walletRepository
                .findByOwnerTypeAndOwnerId(WalletOwnerType.HOTEL_ADMIN, ownerId)
                .orElse(null);

        BigDecimal availableBalance = wallet == null ? zero() : wallet.getAvailableBalance();
        BigDecimal pendingBalance = wallet == null ? zero() : wallet.getPendingBalance();
        BigDecimal lockedBalance = wallet == null ? zero() : wallet.getLockedBalance();
        BigDecimal commissionDebt = wallet == null ? zero() : wallet.getCommissionDebt();

        long openWithdrawalCount = financialQueryRepository.countOpenWithdrawals(ownerId);
        long pendingPaymentCount = financialQueryRepository
                .countPendingPayments(ownerId);
        long unsettledPaymentCount = financialQueryRepository
                .countUnsettledPaidPayments(ownerId);
        long openWalletTopUpCount = financialQueryRepository
                .countOpenWalletTopUps(ownerId);

        List<String> blockers = new ArrayList<>();
        if (openWithdrawalCount > 0) {
            blockers.add("Còn " + openWithdrawalCount + " yêu cầu rút tiền đang xử lý");
        }
        if (availableBalance.signum() != 0) {
            blockers.add("Ví đối tác còn số dư khả dụng " + availableBalance.toPlainString() + " đ");
        }
        if (pendingBalance.signum() != 0) {
            blockers.add("Ví đối tác còn doanh thu đang chờ " + pendingBalance.toPlainString() + " đ");
        }
        if (lockedBalance.signum() != 0) {
            blockers.add("Ví đối tác còn số dư đang khóa " + lockedBalance.toPlainString() + " đ");
        }
        if (commissionDebt.signum() != 0) {
            blockers.add("Ví đối tác còn công nợ hoa hồng " + commissionDebt.toPlainString() + " đ");
        }
        if (pendingPaymentCount > 0) {
            blockers.add("Còn " + pendingPaymentCount + " giao dịch thanh toán đang chờ");
        }
        if (unsettledPaymentCount > 0) {
            blockers.add("Còn " + unsettledPaymentCount + " giao dịch chưa hạch toán hoặc giải ngân xong");
        }
        if (openWalletTopUpCount > 0) {
            blockers.add("Còn " + openWalletTopUpCount + " lệnh nạp ví đang mở");
        }

        return new RoleChangePaymentEligibilityResponse(
                blockers.isEmpty(),
                openWithdrawalCount,
                availableBalance,
                pendingBalance,
                lockedBalance,
                commissionDebt,
                pendingPaymentCount,
                unsettledPaymentCount,
                openWalletTopUpCount,
                List.copyOf(blockers)
        );
    }

    private BigDecimal zero() {
        return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }
}
