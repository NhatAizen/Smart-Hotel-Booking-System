-- EnziuRooms hạch toán VND theo đơn vị đồng nguyên.
-- Không đổi scale của cột để giữ tương thích JPA/Booking Service, chỉ chuẩn hóa
-- commission, ví, giao dịch, rút tiền và hoàn tiền sang số VND nguyên.

-- Payment.amount giữ nguyên để không làm lệch paidAmount của booking cũ.
-- Commission/net được dựng lại theo số VND thực tế đã thu (ROUND(amount)).
UPDATE payments
SET commission_amount = ROUND(ROUND(amount) * commission_rate / 100),
    hotel_net_amount = ROUND(amount) - ROUND(ROUND(amount) * commission_rate / 100)
WHERE commission_amount <> ROUND(ROUND(amount) * commission_rate / 100)
   OR hotel_net_amount <> ROUND(amount) - ROUND(ROUND(amount) * commission_rate / 100);

UPDATE wallets
SET available_balance = ROUND(available_balance),
    pending_balance = ROUND(pending_balance),
    locked_balance = ROUND(locked_balance),
    commission_debt = ROUND(commission_debt),
    total_earned = ROUND(total_earned),
    total_withdrawn = ROUND(total_withdrawn),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE available_balance <> ROUND(available_balance)
   OR pending_balance <> ROUND(pending_balance)
   OR locked_balance <> ROUND(locked_balance)
   OR commission_debt <> ROUND(commission_debt)
   OR total_earned <> ROUND(total_earned)
   OR total_withdrawn <> ROUND(total_withdrawn);

UPDATE withdrawal_requests
SET amount = ROUND(amount)
WHERE amount <> ROUND(amount);

UPDATE wallet_transactions
SET amount = ROUND(amount)
WHERE amount <> ROUND(amount);

UPDATE refund_requests
SET platform_held_amount = ROUND(platform_held_amount),
    hotel_direct_amount = ROUND(hotel_direct_amount),
    manual_reconciliation_amount = ROUND(manual_reconciliation_amount),
    total_paid_amount = ROUND(platform_held_amount)
                      + ROUND(hotel_direct_amount)
                      + ROUND(manual_reconciliation_amount)
WHERE total_paid_amount <> ROUND(platform_held_amount)
                        + ROUND(hotel_direct_amount)
                        + ROUND(manual_reconciliation_amount)
   OR platform_held_amount <> ROUND(platform_held_amount)
   OR hotel_direct_amount <> ROUND(hotel_direct_amount)
   OR manual_reconciliation_amount <> ROUND(manual_reconciliation_amount);
