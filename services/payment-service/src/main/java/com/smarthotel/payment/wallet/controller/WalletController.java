package com.smarthotel.payment.wallet.controller;

import com.smarthotel.payment.payment.dto.PaymentOrderResponse;
import com.smarthotel.payment.payment.dto.PaymentResponse;
import com.smarthotel.payment.payment.service.PaymentService;
import com.smarthotel.payment.wallet.dto.*;
import com.smarthotel.payment.wallet.entity.WithdrawalStatus;
import com.smarthotel.payment.wallet.entity.WithdrawalPayoutMethod;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.service.WalletService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.domain.Page;

@RestController
@RequestMapping("/api")
public class WalletController {
    private final WalletService walletService;
    private final PaymentService paymentService;
    public WalletController(WalletService walletService, PaymentService paymentService) {
        this.walletService = walletService;
        this.paymentService = paymentService;
    }

    @GetMapping("/wallets/me")
    public WalletResponse myWallet(@AuthenticationPrincipal Jwt jwt) {
        return walletService.getWallet(currentUserId(jwt), currentOwnerType(jwt));
    }

    @GetMapping("/wallets/me/transactions")
    public List<WalletTransactionResponse> myTransactions(@AuthenticationPrincipal Jwt jwt) {
        return walletService.getTransactions(currentUserId(jwt), currentOwnerType(jwt));
    }

    @GetMapping("/wallets/me/transactions/page")
    public Page<WalletTransactionResponse> myTransactionsPage(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return walletService.getTransactionsPage(
                currentUserId(jwt), currentOwnerType(jwt), page, size
        );
    }

    @PostMapping("/wallets/top-up/payos")
    public ResponseEntity<PaymentOrderResponse> createTopUp(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateWalletTopUpRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(paymentService.createWalletTopUp(currentUserId(jwt), request));
    }

    @PostMapping("/withdrawals")
    public ResponseEntity<WithdrawalResponse> requestWithdrawal(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody CreateWithdrawalRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(walletService.createWithdrawal(
                        currentUserId(jwt), currentOwnerType(jwt), request, idempotencyKey
                ));
    }

    @PostMapping(value = "/withdrawals/hotel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<WithdrawalResponse> requestHotelWithdrawal(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam BigDecimal amount,
            @RequestParam WithdrawalPayoutMethod payoutMethod,
            @RequestParam(required = false) String bankName,
            @RequestParam(required = false) String bankBin,
            @RequestParam(required = false) String accountNumber,
            @RequestParam(required = false) String accountName,
            @RequestPart(name = "qrImage", required = false) MultipartFile qrImage
    ) {
        if (currentOwnerType(jwt) != WalletOwnerType.HOTEL_ADMIN) {
            throw new IllegalStateException("Chỉ Hotel Admin được dùng luồng rút tiền có QR");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(
                walletService.createHotelWithdrawal(
                        currentUserId(jwt), amount, payoutMethod, bankName, bankBin,
                        accountNumber, accountName, qrImage
                )
        );
    }

    @GetMapping("/withdrawals/{id}/receiver-qr")
    public ResponseEntity<byte[]> receiverQr(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id
    ) {
        boolean systemAdmin = isSystemAdmin(jwt);
        return mediaResponse(walletService.getReceiverQr(
                id, currentUserId(jwt),
                systemAdmin ? null : currentOwnerType(jwt), systemAdmin
        ));
    }

    @GetMapping("/withdrawals/{id}/transfer-proof")
    public ResponseEntity<byte[]> transferProof(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id
    ) {
        boolean systemAdmin = isSystemAdmin(jwt);
        return mediaResponse(walletService.getTransferProof(
                id, currentUserId(jwt),
                systemAdmin ? null : currentOwnerType(jwt), systemAdmin
        ));
    }

    @GetMapping("/withdrawals/me")
    public List<WithdrawalResponse> myWithdrawals(@AuthenticationPrincipal Jwt jwt) {
        return walletService.getMyWithdrawals(currentUserId(jwt), currentOwnerType(jwt));
    }

    @GetMapping("/withdrawals/me/page")
    public Page<WithdrawalResponse> myWithdrawalsPage(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return walletService.getMyWithdrawalsPage(
                currentUserId(jwt), currentOwnerType(jwt), page, size
        );
    }

    @GetMapping("/admin/wallet")
    public WalletResponse platformWallet() { return walletService.getPlatformWallet(); }

    @GetMapping("/admin/wallet/transactions")
    public List<WalletTransactionResponse> platformTransactions() {
        return walletService.getPlatformTransactions();
    }

    @GetMapping("/admin/withdrawals")
    public List<WithdrawalResponse> withdrawals(@RequestParam(required = false) WithdrawalStatus status) {
        return walletService.getAllWithdrawals(status);
    }

    @GetMapping("/admin/withdrawals/page")
    public Page<WithdrawalResponse> withdrawalsPage(
            @RequestParam(required = false) WithdrawalStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return walletService.getAllWithdrawalsPage(status, page, size);
    }

    @PostMapping("/admin/withdrawals/{id}/approve")
    public WithdrawalResponse approve(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestParam(defaultValue = "false") boolean executePayout,
            @Valid @RequestBody(required = false) ReviewWithdrawalRequest request) {
        return walletService.approve(id, currentUserId(jwt), request == null ? null : request.note(), executePayout);
    }

    @PostMapping("/admin/withdrawals/{id}/reject")
    public WithdrawalResponse reject(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) ReviewWithdrawalRequest request) {
        return walletService.reject(id, currentUserId(jwt), request == null ? null : request.note());
    }

    @PostMapping(value = "/admin/withdrawals/{id}/mark-paid", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public WithdrawalResponse markPaid(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @RequestParam String transferReference,
            @RequestPart(name = "transferProof", required = false) MultipartFile transferProof
    ) {
        return walletService.markPaid(
                id, currentUserId(jwt), transferReference, transferProof, idempotencyKey
        );
    }

    @PostMapping("/admin/payments/{paymentId}/release-revenue")
    public PaymentResponse releaseRevenue(
            @PathVariable UUID paymentId,
            @RequestParam(defaultValue = "false") boolean force
    ) {
        return PaymentResponse.from(
                walletService.releaseHotelRevenue(paymentId, force)
        );
    }


    private ResponseEntity<byte[]> mediaResponse(WithdrawalMedia media) {
        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(
                    media.contentType() == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : media.contentType()
            );
        } catch (IllegalArgumentException exception) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(mediaType);
        headers.setCacheControl(CacheControl.noStore());
        headers.setContentDisposition(ContentDisposition.inline()
                .filename(media.fileName() == null ? "withdrawal-image" : media.fileName(), StandardCharsets.UTF_8)
                .build());
        return new ResponseEntity<>(media.data(), headers, HttpStatus.OK);
    }

    private boolean isSystemAdmin(Jwt jwt) {
        return "SYSTEM_ADMIN".equals(currentRole(jwt));
    }

    private WalletOwnerType currentOwnerType(Jwt jwt) {
        String value = currentRole(jwt);
        if ("CUSTOMER".equals(value)) return WalletOwnerType.CUSTOMER;
        if ("HOTEL_ADMIN".equals(value)) return WalletOwnerType.HOTEL_ADMIN;
        throw new IllegalStateException("Vai trò hiện tại không có ví cá nhân");
    }

    private String currentRole(Jwt jwt) {
        Object role = jwt == null ? null : jwt.getClaim("role");
        return role == null ? "" : role.toString().trim().toUpperCase(Locale.ROOT);
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
