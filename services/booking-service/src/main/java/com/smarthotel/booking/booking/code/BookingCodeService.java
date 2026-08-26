package com.smarthotel.booking.booking.code;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class BookingCodeService {

    private static final int MAX_PREFIX_LENGTH = 5;

    private final BookingCodeSequenceRepository sequenceRepository;

    public BookingCodeService(BookingCodeSequenceRepository sequenceRepository) {
        this.sequenceRepository = sequenceRepository;
    }

    /**
     * Sinh mã booking ngắn theo từng khách sạn, ví dụ:
     * Aura Luxury Hotel -> ALH-01, ALH-02, ALH-03...
     *
     * Sequence được khóa theo hotel_id trong PostgreSQL nên hai request đặt phòng
     * chạy đồng thời vẫn không thể nhận cùng một số thứ tự.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String nextCode(UUID hotelId, String hotelName) {
        if (hotelId == null) {
            throw new IllegalArgumentException("Thiếu khách sạn để sinh mã booking");
        }

        String suggestedPrefix = buildPrefix(hotelName);
        sequenceRepository.initializeIfMissing(hotelId, suggestedPrefix);

        BookingCodeSequence sequence = sequenceRepository.findForUpdate(hotelId)
                .orElseThrow(() -> new IllegalStateException(
                        "Không thể khởi tạo bộ đếm mã booking cho khách sạn"
                ));

        long number = sequence.nextNumber();
        sequenceRepository.save(sequence);

        return sequence.getPrefix() + "-" + String.format(Locale.ROOT, "%02d", number);
    }

    static String buildPrefix(String hotelName) {
        String source = hotelName == null ? "" : hotelName.trim();
        String ascii = Normalizer.normalize(source, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]+", " ")
                .trim();

        if (ascii.isBlank()) {
            return "HTL";
        }

        List<String> words = Arrays.stream(ascii.split("\\s+"))
                .filter(word -> !word.isBlank())
                .toList();

        if (words.size() == 1) {
            String word = words.get(0);
            int length = Math.min(3, word.length());
            return word.substring(0, length);
        }

        StringBuilder prefix = new StringBuilder();
        for (String word : words) {
            if (prefix.length() >= MAX_PREFIX_LENGTH) {
                break;
            }
            prefix.append(word.charAt(0));
        }

        if (prefix.length() >= 2) {
            return prefix.toString();
        }

        String first = words.get(0);
        return first.substring(0, Math.min(3, first.length()));
    }
}
