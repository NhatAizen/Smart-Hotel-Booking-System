package com.smarthotel.payment.wallet.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "withdrawal_requests")
public class WithdrawalRequest {
    protected WithdrawalRequest() {}

    @Id @Column(nullable = false, updatable = false)
    private UUID id;
    @Column(name = "wallet_id", nullable = false)
    private UUID walletId;
    @Column(name = "hotel_owner_id", nullable = false)
    private UUID ownerId;
    @Enumerated(EnumType.STRING)
    @Column(name = "owner_type", nullable = false, length = 30)
    private WalletOwnerType ownerType;
    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "payout_method", nullable = false, length = 30)
    private WithdrawalPayoutMethod payoutMethod;

    @Column(name = "bank_name", length = 120)
    private String bankName;
    @Column(name = "bank_bin", length = 20)
    private String bankBin;
    @Column(name = "account_number", length = 50)
    private String accountNumber;
    @Column(name = "account_name", length = 180)
    private String accountName;

    @Column(name = "receiver_qr_data", columnDefinition = "bytea")
    private byte[] receiverQrData;
    @Column(name = "receiver_qr_content_type", length = 100)
    private String receiverQrContentType;
    @Column(name = "receiver_qr_file_name", length = 255)
    private String receiverQrFileName;

    @Column(name = "transfer_proof_data", columnDefinition = "bytea")
    private byte[] transferProofData;
    @Column(name = "transfer_proof_content_type", length = 100)
    private String transferProofContentType;
    @Column(name = "transfer_proof_file_name", length = 255)
    private String transferProofFileName;
    @Column(name = "paid_by")
    private UUID paidBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private WithdrawalStatus status;
    @Column(name = "reviewed_by")
    private UUID reviewedBy;
    @Column(name = "review_note", length = 500)
    private String reviewNote;
    @Column(name = "payout_id", length = 150)
    private String payoutId;
    @Column(name = "payout_reference", length = 150)
    private String payoutReference;
    @Column(name = "failure_reason", length = 1000)
    private String failureReason;
    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;
    @Column(name = "reviewed_at")
    private Instant reviewedAt;
    @Column(name = "paid_at")
    private Instant paidAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public WithdrawalRequest(UUID walletId, UUID ownerId, WalletOwnerType ownerType,
                             BigDecimal amount, String bankName, String bankBin,
                             String accountNumber, String accountName) {
        this(walletId, ownerId, ownerType, amount, WithdrawalPayoutMethod.BANK_ACCOUNT,
                bankName, bankBin, accountNumber, accountName, null, null, null);
    }

    public WithdrawalRequest(UUID walletId, UUID ownerId, WalletOwnerType ownerType,
                             BigDecimal amount, WithdrawalPayoutMethod payoutMethod,
                             String bankName, String bankBin, String accountNumber, String accountName,
                             byte[] receiverQrData, String receiverQrContentType, String receiverQrFileName) {
        if (ownerType != WalletOwnerType.HOTEL_ADMIN && ownerType != WalletOwnerType.CUSTOMER) {
            throw new IllegalArgumentException("Chỉ Customer hoặc Hotel Admin được yêu cầu rút tiền");
        }
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.walletId = walletId;
        this.ownerId = ownerId;
        this.ownerType = ownerType;
        this.amount = amount.setScale(2, RoundingMode.HALF_UP);
        this.payoutMethod = payoutMethod == null ? WithdrawalPayoutMethod.BANK_ACCOUNT : payoutMethod;
        this.bankName = clean(bankName);
        this.bankBin = clean(bankBin);
        this.accountNumber = clean(accountNumber);
        this.accountName = clean(accountName);
        this.receiverQrData = receiverQrData;
        this.receiverQrContentType = clean(receiverQrContentType);
        this.receiverQrFileName = clean(receiverQrFileName);
        this.status = WithdrawalStatus.PENDING;
        this.requestedAt = now;
        this.updatedAt = now;
    }

    public void approve(UUID adminId, String note) {
        ensure(WithdrawalStatus.PENDING);
        status = WithdrawalStatus.APPROVED; reviewedBy = adminId; reviewNote = clean(note);
        reviewedAt = Instant.now(); updatedAt = reviewedAt;
    }

    public void markProcessing(String payoutId, String reference) {
        if (status != WithdrawalStatus.APPROVED && status != WithdrawalStatus.PROCESSING)
            throw new IllegalStateException("Yêu cầu rút tiền chưa được duyệt");
        status = WithdrawalStatus.PROCESSING; this.payoutId = clean(payoutId); this.payoutReference = clean(reference);
        updatedAt = Instant.now();
    }

    public void attachTransferProof(byte[] data, String contentType, String fileName) {
        this.transferProofData = data;
        this.transferProofContentType = clean(contentType);
        this.transferProofFileName = clean(fileName);
        this.updatedAt = Instant.now();
    }

    public void markPaid(String payoutId, String reference, UUID adminId) {
        if (status == WithdrawalStatus.PAID) return;
        if (status != WithdrawalStatus.APPROVED && status != WithdrawalStatus.PROCESSING)
            throw new IllegalStateException("Yêu cầu rút tiền chưa sẵn sàng để hoàn tất");
        status = WithdrawalStatus.PAID; this.payoutId = clean(payoutId); this.payoutReference = clean(reference);
        this.paidBy = adminId;
        paidAt = Instant.now(); updatedAt = paidAt; failureReason = null;
    }

    public void reject(UUID adminId, String note) {
        ensure(WithdrawalStatus.PENDING); status = WithdrawalStatus.REJECTED; reviewedBy = adminId;
        reviewNote = clean(note); reviewedAt = Instant.now(); updatedAt = reviewedAt;
    }

    public void fail(String reason) {
        if (status == WithdrawalStatus.PAID) return;
        status = WithdrawalStatus.FAILED; failureReason = clean(reason); updatedAt = Instant.now();
    }

    private void ensure(WithdrawalStatus expected) {
        if (status != expected) throw new IllegalStateException("Trạng thái yêu cầu rút tiền không hợp lệ: " + status);
    }

    private static String clean(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    public UUID getId() { return id; }
    public UUID getWalletId() { return walletId; }
    public UUID getOwnerId() { return ownerId; }
    public UUID getHotelOwnerId() { return ownerId; }
    public WalletOwnerType getOwnerType() { return ownerType; }
    public BigDecimal getAmount() { return amount; }
    public WithdrawalPayoutMethod getPayoutMethod() { return payoutMethod; }
    public String getBankName() { return bankName; }
    public String getBankBin() { return bankBin; }
    public String getAccountNumber() { return accountNumber; }
    public String getAccountName() { return accountName; }
    public byte[] getReceiverQrData() { return receiverQrData; }
    public String getReceiverQrContentType() { return receiverQrContentType; }
    public String getReceiverQrFileName() { return receiverQrFileName; }
    public boolean hasReceiverQr() { return receiverQrData != null && receiverQrData.length > 0; }
    public byte[] getTransferProofData() { return transferProofData; }
    public String getTransferProofContentType() { return transferProofContentType; }
    public String getTransferProofFileName() { return transferProofFileName; }
    public boolean hasTransferProof() { return transferProofData != null && transferProofData.length > 0; }
    public UUID getPaidBy() { return paidBy; }
    public WithdrawalStatus getStatus() { return status; }
    public UUID getReviewedBy() { return reviewedBy; }
    public String getReviewNote() { return reviewNote; }
    public String getPayoutId() { return payoutId; }
    public String getPayoutReference() { return payoutReference; }
    public String getFailureReason() { return failureReason; }
    public Instant getRequestedAt() { return requestedAt; }
    public Instant getReviewedAt() { return reviewedAt; }
    public Instant getPaidAt() { return paidAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
