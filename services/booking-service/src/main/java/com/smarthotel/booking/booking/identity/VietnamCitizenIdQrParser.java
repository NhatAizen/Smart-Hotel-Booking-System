package com.smarthotel.booking.booking.identity;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

public final class VietnamCitizenIdQrParser {

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            DateTimeFormatter.ofPattern("ddMMyyyy"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ISO_LOCAL_DATE
    );

    private VietnamCitizenIdQrParser() {
    }

    public static CitizenIdQrData parse(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            throw new IllegalArgumentException("QR CCCD không có dữ liệu");
        }

        String normalized = rawValue.trim().replace("\r", "").replace("\n", "");
        String[] fields = normalized.split("\\|", -1);
        if (fields.length < 4) {
            throw new IllegalArgumentException(
                    "QR CCCD không đúng định dạng. Hãy quét mã QR trên CCCD gắn chip."
            );
        }

        String identityNumber = digitsOnly(fields[0]);
        String fullName = fields[2] == null ? "" : fields[2].trim();
        LocalDate dateOfBirth = parseDate(fields[3]);

        if (identityNumber.length() < 9 || identityNumber.length() > 12) {
            throw new IllegalArgumentException("Số định danh trong QR CCCD không hợp lệ");
        }
        if (fullName.isBlank()) {
            throw new IllegalArgumentException("QR CCCD không có họ tên");
        }
        if (dateOfBirth == null) {
            throw new IllegalArgumentException("Không đọc được ngày sinh từ QR CCCD");
        }

        return new CitizenIdQrData(identityNumber, fullName, dateOfBirth);
    }

    private static String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    private static LocalDate parseDate(String value) {
        String raw = value == null ? "" : value.trim();
        if (raw.isBlank()) return null;

        for (DateTimeFormatter formatter : DATE_FORMATS) {
            try {
                return LocalDate.parse(raw, formatter);
            } catch (DateTimeParseException ignored) {
                // Thử định dạng kế tiếp.
            }
        }
        return null;
    }

    public record CitizenIdQrData(
            String identityNumber,
            String fullName,
            LocalDate dateOfBirth
    ) {
    }
}
