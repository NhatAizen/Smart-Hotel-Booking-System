package com.smarthotel.ai.assistant.v2.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.ai.assistant.v2.dto.AssistantRequest;
import com.smarthotel.ai.assistant.v2.dto.IntentAnalysis;
import com.smarthotel.ai.gemini.GeminiClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class IntentAnalysisService {

    private static final Pattern MONEY_PATTERN = Pattern.compile(
            "(?i)(?:duoi|dưới|toi da|tối đa|ngan sach|ngân sách|budget)?\\s*([0-9][0-9.,]{2,})\\s*(?:đ|d|vnd|dong|đồng)?"
    );
    private static final Pattern PEOPLE_PATTERN = Pattern.compile("(?i)(\\d{1,2})\\s*(?:nguoi|người|khach|khách)");
    private static final Pattern STAR_PATTERN = Pattern.compile("(?i)([1-5])\\s*(?:sao|star)");
    private static final Pattern ISO_DATE_PATTERN = Pattern.compile("(20\\d{2}-\\d{2}-\\d{2})");
    private static final Pattern VN_DATE_PATTERN = Pattern.compile("(\\d{1,2})[/-](\\d{1,2})(?:[/-](20\\d{2}))?");

    private final GeminiClient geminiClient;
    private final ObjectMapper objectMapper;

    public IntentAnalysisService(GeminiClient geminiClient, ObjectMapper objectMapper) {
        this.geminiClient = geminiClient;
        this.objectMapper = objectMapper;
    }

    public IntentAnalysis analyze(AssistantRequest request) {
        try {
            String raw = geminiClient.generate(buildExtractionPrompt(request));
            IntentAnalysis parsed = parseJson(raw);
            return mergeRequestContext(request, parsed);
        } catch (Exception ignored) {
            return fallback(request);
        }
    }

    private String buildExtractionPrompt(AssistantRequest request) {
        return """
                You are an intent extractor for a Vietnamese hotel booking assistant.
                Return ONLY one valid JSON object. No markdown, no explanation.

                Allowed intent values:
                RECOMMEND_HOTELS, COMPARE_HOTELS, REVIEW_SUMMARY, MY_BOOKINGS, POLICY, GENERAL.

                JSON schema:
                {
                  "intent": "...",
                  "city": string|null,
                  "maxBudgetPerNight": number|null,
                  "starRating": integer|null,
                  "adults": integer|null,
                  "children": integer|null,
                  "checkIn": "YYYY-MM-DD"|null,
                  "checkOut": "YYYY-MM-DD"|null,
                  "amenities": [string],
                  "hotelNames": [string],
                  "bookingCode": string|null
                }

                Extraction rules:
                - Budget is VND per room per night.
                - "2 người" without child wording means adults=2.
                - Hotel comparison -> COMPARE_HOTELS.
                - Questions about the user's own reservation/payment/check-in/check-out -> MY_BOOKINGS.
                - Questions asking to summarize guest reviews -> REVIEW_SUMMARY.
                - Questions about cancellation, deposit, payment rules, QR check-in or policy -> POLICY.
                - Hotel discovery/recommendation/search -> RECOMMEND_HOTELS.
                - Keep Vietnamese hotel names exactly when possible.
                - Do not guess a date that the user did not state.
                - Today is %s.

                User message:
                %s
                """.formatted(LocalDate.now(), request.message().trim());
    }

    private IntentAnalysis parseJson(String raw) throws Exception {
        String clean = raw == null ? "" : raw.trim();
        if (clean.startsWith("```")) {
            clean = clean.replaceFirst("^```(?:json)?\\s*", "");
            clean = clean.replaceFirst("\\s*```$", "");
        }

        JsonNode node = objectMapper.readTree(clean);
        return new IntentAnalysis(
                text(node, "intent"),
                text(node, "city"),
                decimal(node, "maxBudgetPerNight"),
                integer(node, "starRating"),
                integer(node, "adults"),
                integer(node, "children"),
                date(node, "checkIn"),
                date(node, "checkOut"),
                stringList(node, "amenities"),
                stringList(node, "hotelNames"),
                text(node, "bookingCode")
        );
    }

    private IntentAnalysis mergeRequestContext(AssistantRequest request, IntentAnalysis parsed) {
        return new IntentAnalysis(
                normalizeIntent(parsed.intent(), request.message()),
                parsed.city(),
                parsed.maxBudgetPerNight(),
                parsed.starRating(),
                request.adults() != null ? request.adults() : parsed.adults(),
                request.children() != null ? request.children() : parsed.children(),
                request.checkIn() != null ? request.checkIn() : parsed.checkIn(),
                request.checkOut() != null ? request.checkOut() : parsed.checkOut(),
                parsed.amenities() == null ? List.of() : parsed.amenities(),
                parsed.hotelNames() == null ? List.of() : parsed.hotelNames(),
                parsed.bookingCode()
        );
    }

    private IntentAnalysis fallback(AssistantRequest request) {
        String message = request.message();
        String normalized = normalize(message);
        String intent;
        if (normalized.contains("so sanh")) {
            intent = "COMPARE_HOTELS";
        } else if (normalized.contains("tom tat") && normalized.contains("danh gia")
                || normalized.contains("review") && normalized.contains("tom")) {
            intent = "REVIEW_SUMMARY";
        } else if (normalized.contains("booking cua toi")
                || normalized.contains("dat phong cua toi")
                || normalized.contains("con phai thanh toan")
                || normalized.contains("booking sap toi")
                || normalized.contains("nhan phong cua toi")) {
            intent = "MY_BOOKINGS";
        } else if (normalized.contains("huy")
                || normalized.contains("hoan tien")
                || normalized.contains("dat coc")
                || normalized.contains("check-in")
                || normalized.contains("check in")
                || normalized.contains("qr")
                || normalized.contains("chinh sach")) {
            intent = "POLICY";
        } else if (normalized.contains("khach san")
                || normalized.contains("tim")
                || normalized.contains("goi y")) {
            intent = "RECOMMEND_HOTELS";
        } else {
            intent = "GENERAL";
        }

        return new IntentAnalysis(
                intent,
                inferCity(message),
                inferMoney(message),
                inferStars(message),
                request.adults() != null ? request.adults() : inferPeople(message),
                request.children() != null ? request.children() : 0,
                request.checkIn() != null ? request.checkIn() : inferDates(message).stream().findFirst().orElse(null),
                request.checkOut() != null ? request.checkOut() : inferDates(message).stream().skip(1).findFirst().orElse(null),
                inferAmenities(message),
                List.of(),
                inferBookingCode(message)
        );
    }

    private String normalizeIntent(String intent, String message) {
        if (intent == null) return fallback(new AssistantRequest(message, null, null, null, null, null, List.of())).intent();
        return switch (intent.trim().toUpperCase(Locale.ROOT)) {
            case "RECOMMEND_HOTELS", "COMPARE_HOTELS", "REVIEW_SUMMARY", "MY_BOOKINGS", "POLICY", "GENERAL" -> intent.trim().toUpperCase(Locale.ROOT);
            default -> "GENERAL";
        };
    }

    private String inferCity(String message) {
        List<String> known = List.of("Đà Lạt", "Hồ Chí Minh", "TP.HCM", "Hà Nội", "Đà Nẵng", "Nha Trang", "Vũng Tàu", "Phú Quốc", "Huế", "Hội An");
        String normalized = normalize(message);
        return known.stream().filter(city -> normalized.contains(normalize(city))).findFirst().orElse(null);
    }

    private BigDecimal inferMoney(String message) {
        Matcher matcher = MONEY_PATTERN.matcher(message);
        BigDecimal best = null;
        while (matcher.find()) {
            String digits = matcher.group(1).replaceAll("[^0-9]", "");
            if (digits.length() < 4) continue;
            try {
                BigDecimal value = new BigDecimal(digits);
                if (value.compareTo(BigDecimal.valueOf(10_000)) >= 0) best = value;
            } catch (NumberFormatException ignored) {
            }
        }
        return best;
    }

    private Integer inferPeople(String message) {
        Matcher matcher = PEOPLE_PATTERN.matcher(message);
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : null;
    }

    private Integer inferStars(String message) {
        Matcher matcher = STAR_PATTERN.matcher(message);
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : null;
    }

    private List<LocalDate> inferDates(String message) {
        List<LocalDate> dates = new ArrayList<>();
        Matcher iso = ISO_DATE_PATTERN.matcher(message);
        while (iso.find()) {
            try {
                dates.add(LocalDate.parse(iso.group(1)));
            } catch (DateTimeParseException ignored) {
            }
        }
        if (!dates.isEmpty()) return dates;

        Matcher vn = VN_DATE_PATTERN.matcher(message);
        while (vn.find()) {
            int day = Integer.parseInt(vn.group(1));
            int month = Integer.parseInt(vn.group(2));
            int year = vn.group(3) == null ? LocalDate.now().getYear() : Integer.parseInt(vn.group(3));
            try {
                dates.add(LocalDate.of(year, month, day));
            } catch (Exception ignored) {
            }
        }
        return dates;
    }

    private List<String> inferAmenities(String message) {
        String normalized = normalize(message);
        List<String> amenities = new ArrayList<>();
        if (normalized.contains("ho boi")) amenities.add("Hồ bơi");
        if (normalized.contains("wifi")) amenities.add("WiFi");
        if (normalized.contains("spa")) amenities.add("Spa");
        if (normalized.contains("gym") || normalized.contains("phong tap")) amenities.add("Phòng gym");
        if (normalized.contains("do xe") || normalized.contains("bai xe")) amenities.add("Bãi đỗ xe");
        if (normalized.contains("an sang") || normalized.contains("breakfast")) amenities.add("Bữa sáng");
        return amenities;
    }

    private String inferBookingCode(String message) {
        Matcher matcher = Pattern.compile("(?i)(EZR-[A-Z0-9-]+)").matcher(message);
        return matcher.find() ? matcher.group(1).toUpperCase(Locale.ROOT) : null;
    }

    private String normalize(String value) {
        if (value == null) return "";
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT);
        return normalized.replaceAll("\\s+", " ").trim();
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText(null);
    }

    private Integer integer(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asInt();
    }

    private BigDecimal decimal(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        try {
            return value.decimalValue();
        } catch (Exception ignored) {
            return null;
        }
    }

    private LocalDate date(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null || value.isBlank()) return null;
        try {
            return LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private List<String> stringList(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isArray()) return List.of();
        List<String> result = new ArrayList<>();
        value.forEach(item -> {
            if (item.isTextual() && !item.asText().isBlank()) result.add(item.asText().trim());
        });
        return List.copyOf(result);
    }
}
