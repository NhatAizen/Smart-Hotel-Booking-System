CREATE TABLE IF NOT EXISTS booking_code_sequences (
    hotel_id UUID PRIMARY KEY,
    prefix VARCHAR(12) NOT NULL,
    last_number BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_booking_code_sequences_last_number_non_negative
        CHECK (last_number >= 0)
);

-- Mã hiển thị mới được đánh số theo từng khách sạn. UUID của booking vẫn là
-- định danh toàn cục của hệ thống, vì vậy mã ALH-01 chỉ cần duy nhất trong
-- phạm vi một khách sạn. Các booking cũ dạng EZR-... được giữ nguyên.
DROP INDEX IF EXISTS uk_bookings_booking_code;

CREATE UNIQUE INDEX IF NOT EXISTS uk_bookings_hotel_booking_code
    ON bookings (hotel_id, booking_code);
