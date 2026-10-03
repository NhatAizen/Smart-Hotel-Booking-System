-- Keep ck_bookings_paid_amount unchanged. The compatibility projection is
-- bounded by total; this nullable snapshot preserves the confirmed financial
-- position while async reconciliation is unresolved. No historical money rewrite.
ALTER TABLE bookings ADD COLUMN room_change_retained_paid_amount NUMERIC(14,2);
ALTER TABLE bookings ADD CONSTRAINT ck_booking_room_change_retained_paid_amount
    CHECK (room_change_retained_paid_amount IS NULL OR room_change_retained_paid_amount >= 0);
