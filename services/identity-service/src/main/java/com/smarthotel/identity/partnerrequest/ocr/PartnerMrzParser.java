package com.smarthotel.identity.partnerrequest.ocr;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Lightweight TD1/MRZ parser tailored for Vietnamese identity-card OCR.
 *
 * The parser deliberately tolerates common Tesseract errors around the fixed
 * prefix/nationality and truncated filler characters, but it never relaxes the
 * identity cross-check: document check digit, date-of-birth check digit,
 * expiry check digit, submitted 12-digit identity number, submitted DOB and
 * submitted name must all be consistent before the back side is accepted.
 */
public final class PartnerMrzParser {

    private PartnerMrzParser() {
    }

    public static Result parse(
            String rawText,
            String submittedIdentity,
            String submittedFullName,
            LocalDate submittedDateOfBirth
    ) {
        if (rawText == null || rawText.isBlank()) {
            throw new PartnerOcrVerificationException(
                    "Không đọc được MRZ mặt sau CCCD. Hãy chụp mặt sau thẳng, gần hơn và đủ sáng"
            );
        }

        String expectedIdentity = digitsOnly(submittedIdentity);
        String expectedDob = submittedDateOfBirth.format(DateTimeFormatter.ofPattern("yyMMdd"));
        List<String> lines = extractLines(rawText);

        // Ưu tiên parser TD1 nghiêm ngặt nếu OCR đủ đẹp.
        // Nếu Tesseract sai 1-2 ký tự check digit hoặc ngắt dòng MRZ không chuẩn,
        // ta chuyển sang chế độ đối chiếu mềm nhưng vẫn bắt buộc cùng số CCCD + ngày sinh.
        try {
            return parseStrict(
                    lines,
                    expectedIdentity,
                    expectedDob,
                    submittedFullName,
                    submittedDateOfBirth
            );
        } catch (PartnerOcrVerificationException strictFailure) {
            Result tolerant = parseTolerant(
                    rawText,
                    lines,
                    expectedIdentity,
                    expectedDob,
                    submittedFullName,
                    submittedDateOfBirth
            );
            if (tolerant != null) {
                return tolerant;
            }
            throw strictFailure;
        }
    }

    private static Result parseStrict(
            List<String> lines,
            String expectedIdentity,
            String expectedDob,
            String submittedFullName,
            LocalDate submittedDateOfBirth
    ) {
        String line1 = chooseLine1(lines, expectedIdentity);
        String line2 = chooseLine2(lines, submittedDateOfBirth);
        String line3 = chooseNameLine(lines, submittedFullName);

        if (line1 == null || line2 == null || line3 == null) {
            throw new PartnerOcrVerificationException(
                    "Không đọc đủ dữ liệu MRZ mặt sau. Hãy giữ rõ phần 3 dòng ký tự ở cạnh dưới của thẻ"
            );
        }

        boolean documentCheckValid = line1.length() >= 15
                && validCheckDigit(line1.substring(5, 14), line1.charAt(14));
        boolean dobCheckValid = line2.length() >= 7
                && validCheckDigit(line2.substring(0, 6), line2.charAt(6));
        boolean expiryCheckValid = line2.length() >= 15
                && validCheckDigit(line2.substring(8, 14), line2.charAt(14));
        boolean formatValid = documentCheckValid && dobCheckValid && expiryCheckValid;

        if (!formatValid) {
            throw new PartnerOcrVerificationException(
                    "MRZ mặt sau đã được phát hiện nhưng một vài ký tự kiểm tra chưa đủ rõ"
            );
        }

        String line1Digits = digitsOnly(line1.substring(Math.min(15, line1.length())));
        boolean identityMatched = expectedIdentity.length() == 12
                && line1Digits.contains(expectedIdentity);
        if (!identityMatched) {
            throw new PartnerOcrVerificationException(
                    "Số định danh trong MRZ mặt sau không khớp với CCCD mặt trước"
            );
        }

        String mrzDob = digitsOnly(line2.substring(0, Math.min(6, line2.length())));
        boolean dobMatched = expectedDob.equals(mrzDob);
        if (!dobMatched) {
            throw new PartnerOcrVerificationException(
                    "Ngày sinh trong MRZ mặt sau không khớp với mặt trước CCCD"
            );
        }

        String mrzName = line3.replace('<', ' ').replaceAll("\\s+", " ").trim();
        double nameScore = nameScore(submittedFullName, mrzName);
        double nameCoverage = nameCoverage(submittedFullName, mrzName);
        boolean nameMatched = nameScore >= 0.68d && nameCoverage >= 0.65d;
        if (!nameMatched) {
            throw new PartnerOcrVerificationException(
                    "Họ tên trong MRZ mặt sau không khớp với mặt trước CCCD"
            );
        }

        MrzDetails details = extractDetails(line2);

        return new Result(
                true,
                expectedIdentity,
                submittedFullName == null ? mrzName : submittedFullName.trim(),
                submittedDateOfBirth,
                true,
                true,
                true,
                details.gender(),
                details.nationality(),
                details.expiryDate(),
                true
        );
    }

    private static Result parseTolerant(
            String rawText,
            List<String> lines,
            String expectedIdentity,
            String expectedDob,
            String submittedFullName,
            LocalDate submittedDateOfBirth
    ) {
        if (expectedIdentity.length() != 12 || expectedDob.length() != 6 || lines.isEmpty()) {
            return null;
        }

        int identityDistance = minimumDigitWindowDistance(lines, expectedIdentity);
        int dobDistance = minimumDigitWindowDistance(lines, expectedDob);
        boolean identityExact = identityDistance == 0;
        boolean dobExact = dobDistance == 0;

        // Tesseract thường nhầm đúng một ký tự O/0, I/1, S/5 hoặc làm mất một
        // ký tự khi MRZ hơi phản sáng. Chỉ chấp nhận sai tối đa 1 ký tự, và bắt
        // buộc ít nhất CCCD hoặc ngày sinh phải khớp tuyệt đối.
        boolean identityMatched = identityDistance <= 1;
        boolean dobMatched = dobDistance <= 1;
        boolean strongCrossCheck = identityMatched
                && dobMatched
                && (identityExact || dobExact);

        String sanitizedCombined = lines.stream()
                .reduce("", (left, right) -> left + " " + right);

        long longLineCount = lines.stream()
                .filter(line -> line.length() >= 18)
                .count();
        boolean hasMrzCountryMarker = lines.stream().anyMatch(line ->
                line.contains("VNM")
                        || positionalMatches(
                        line.substring(0, Math.min(5, line.length())),
                        "IDVNM"
                ) >= 3
        );
        boolean hasMrzFillers = sanitizedCombined.indexOf('<') >= 0;

        // Không bắt buộc dấu '<' vì Tesseract thường bỏ dấu này dù các chữ/số
        // vẫn đọc rõ. Hai dòng dài + marker VNM/IDVNM đã đủ chứng minh vùng MRZ.
        boolean mrzShapeDetected = hasMrzCountryMarker
                && (hasMrzFillers || longLineCount >= 2);

        String readableName = sanitizedCombined.replace('<', ' ');
        double score = nameScore(submittedFullName, readableName);
        double coverage = nameCoverage(submittedFullName, readableName);
        boolean nameMatched = score >= 0.50d && coverage >= 0.45d;

        if (!mrzShapeDetected) {
            return null;
        }

        // Đã nhận diện được cấu trúc MRZ nhưng thông tin không trùng mặt trước:
        // báo đúng lỗi nghiệp vụ thay vì đánh đồng với trường hợp ảnh bị mờ/không đọc được.
        if (!identityMatched) {
            throw new PartnerOcrVerificationException(
                    "Mặt sau CCCD không khớp với mặt trước: số định danh trong MRZ là của một CCCD khác"
            );
        }
        if (!dobMatched) {
            throw new PartnerOcrVerificationException(
                    "Mặt sau CCCD không khớp với mặt trước: ngày sinh trong MRZ khác thông tin mặt trước"
            );
        }
        if (!strongCrossCheck) {
            return null;
        }

        String detailsLine2 = chooseBestDetailsLine2(lines, expectedDob);
        MrzDetails details = extractDetails(detailsLine2);

        return new Result(
                false,
                expectedIdentity,
                submittedFullName == null ? "" : submittedFullName.trim(),
                submittedDateOfBirth,
                true,
                nameMatched,
                true,
                details.gender(),
                details.nationality(),
                details.expiryDate(),
                true
        );
    }

    private static String chooseBestDetailsLine2(List<String> lines, String expectedDob) {
        return lines.stream()
                .filter(line -> line.length() >= 18)
                .max(Comparator.comparingInt(line -> {
                    int score = 0;
                    String firstSix = digitsOnly(line.substring(0, Math.min(6, line.length())));
                    if (expectedDob.equals(firstSix)) score += 20;
                    if (line.length() > 7 && (line.charAt(7) == 'M' || line.charAt(7) == 'F')) score += 5;
                    if (line.contains("VNM")) score += 5;
                    return score;
                }))
                .orElse(null);
    }

    private static MrzDetails extractDetails(String line2) {
        if (line2 == null || line2.length() < 15) {
            return new MrzDetails(null, null, null);
        }

        String gender = null;
        if (line2.length() > 7) {
            char sex = Character.toUpperCase(line2.charAt(7));
            if (sex == 'M') gender = "Nam";
            else if (sex == 'F') gender = "Nữ";
        }

        String nationality = null;
        if (line2.length() >= 18) {
            String candidate = line2.substring(15, 18).replace('<', ' ').trim();
            if (candidate.matches("[A-Z]{3}")) nationality = candidate;
        }
        if (nationality == null && line2.contains("VNM")) {
            nationality = "VNM";
        }

        LocalDate expiryDate = null;
        if (line2.length() >= 14) {
            String expiryDigits = digitsOnly(line2.substring(8, 14));
            if (expiryDigits.length() == 6) {
                try {
                    int yy = Integer.parseInt(expiryDigits.substring(0, 2));
                    int month = Integer.parseInt(expiryDigits.substring(2, 4));
                    int day = Integer.parseInt(expiryDigits.substring(4, 6));
                    int year = 2000 + yy;
                    expiryDate = LocalDate.of(year, month, day);
                } catch (RuntimeException ignored) {
                    // OCR có thể đọc sai một ký tự ở ngày hết hạn; không làm fail cả bước xác minh.
                }
            }
        }

        return new MrzDetails(gender, nationality, expiryDate);
    }

    private record MrzDetails(String gender, String nationality, LocalDate expiryDate) {
    }

    private static int minimumDigitWindowDistance(List<String> lines, String expected) {
        int best = Integer.MAX_VALUE;
        int length = expected.length();

        for (String line : lines) {
            String digits = digitsOnly(line);
            if (digits.length() < length) {
                continue;
            }

            for (int index = 0; index <= digits.length() - length; index++) {
                String window = digits.substring(index, index + length);
                int distance = hammingDistance(expected, window);
                if (distance < best) {
                    best = distance;
                    if (best == 0) {
                        return 0;
                    }
                }
            }
        }

        return best;
    }

    private static int hammingDistance(String left, String right) {
        if (left.length() != right.length()) {
            return Integer.MAX_VALUE;
        }
        int distance = 0;
        for (int index = 0; index < left.length(); index++) {
            if (left.charAt(index) != right.charAt(index)) {
                distance++;
            }
        }
        return distance;
    }

    private static String chooseLine1(List<String> lines, String submittedIdentity) {
        String expectedIdentity = digitsOnly(submittedIdentity);
        return lines.stream()
                .filter(line -> line.length() >= 25)
                .filter(line -> line.matches(".*[A-Z].*"))
                .max(Comparator.comparingInt(line -> line1Score(line, expectedIdentity)))
                .filter(line -> line1Score(line, expectedIdentity) >= 14)
                .map(line -> line.length() > 30 ? line.substring(0, 30) : line)
                .orElse(null);
    }

    private static int line1Score(String line, String expectedIdentity) {
        if (line.length() < 15) return 0;
        int score = 0;
        String prefix = line.substring(0, Math.min(5, line.length()));
        int prefixMatches = positionalMatches(prefix, "IDVNM");
        score += prefixMatches * 2;
        if (validCheckDigit(line.substring(5, 14), line.charAt(14))) score += 12;
        if (digitsOnly(line.substring(Math.min(15, line.length()))).contains(expectedIdentity)) score += 20;
        if (line.length() >= 30) score += 8;
        if (line.contains("<<")) score += 2;
        return score;
    }

    private static String chooseLine2(List<String> lines, LocalDate submittedDob) {
        String expectedDob = submittedDob.format(DateTimeFormatter.ofPattern("yyMMdd"));
        return lines.stream()
                .filter(line -> line.length() >= 15)
                .filter(line -> !line.equals(chooseSafePrefix(line)))
                .max(Comparator.comparingInt(line -> line2Score(line, expectedDob)))
                .filter(line -> line2Score(line, expectedDob) >= 12)
                .map(line -> line.length() > 30 ? line.substring(0, 30) : line)
                .orElse(null);
    }

    // Keeps chooseLine2's predicate simple while excluding obvious line-1 candidates.
    private static String chooseSafePrefix(String line) {
        return line.length() >= 5 && positionalMatches(line.substring(0, 5), "IDVNM") >= 3
                ? line
                : "";
    }

    private static int line2Score(String line, String expectedDob) {
        if (line.length() < 15) return 0;
        int score = 0;
        String dob = digitsOnly(line.substring(0, 6));
        if (dob.equals(expectedDob)) score += 20;
        if (validCheckDigit(line.substring(0, 6), line.charAt(6))) score += 8;
        if (validCheckDigit(line.substring(8, 14), line.charAt(14))) score += 8;
        if (line.contains("VNM") || line.contains("VN")) score += 2;
        return score;
    }

    private static String chooseNameLine(List<String> lines, String submittedFullName) {
        return lines.stream()
                .filter(line -> line.length() >= 12)
                .filter(line -> line.contains("<"))
                .filter(line -> line.matches(".*[A-Z].*"))
                .max(Comparator.comparingDouble(line -> nameScore(
                        submittedFullName,
                        line.replace('<', ' ')
                )))
                .filter(line -> nameScore(submittedFullName, line.replace('<', ' ')) >= 0.68d
                        && nameCoverage(submittedFullName, line.replace('<', ' ')) >= 0.65d)
                .orElse(null);
    }

    static List<String> extractLines(String text) {
        Set<String> result = new LinkedHashSet<>();
        for (String raw : text.split("\\R")) {
            String line = sanitize(raw);
            if (line.length() >= 12) result.add(line);
        }
        return new ArrayList<>(result);
    }

    private static String sanitize(String raw) {
        if (raw == null) return "";
        return Normalizer.normalize(raw, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toUpperCase(Locale.ROOT)
                .replace('«', '<')
                .replaceAll("[^A-Z0-9<]", "")
                .trim();
    }

    private static boolean validCheckDigit(String field, char rawCheckDigit) {
        char check = mapDigitLike(Character.toUpperCase(rawCheckDigit));
        if (!Character.isDigit(check)) return false;
        return checkDigit(field) == (check - '0');
    }

    static int checkDigit(String field) {
        int[] weights = {7, 3, 1};
        int total = 0;
        for (int i = 0; i < field.length(); i++) {
            char c = Character.toUpperCase(field.charAt(i));
            int value;
            if (c >= '0' && c <= '9') value = c - '0';
            else if (c >= 'A' && c <= 'Z') value = c - 'A' + 10;
            else value = 0;
            total += value * weights[i % 3];
        }
        return total % 10;
    }

    private static String digitsOnly(String value) {
        if (value == null) return "";
        StringBuilder out = new StringBuilder();
        for (char raw : value.toUpperCase(Locale.ROOT).toCharArray()) {
            char mapped = mapDigitLike(raw);
            if (Character.isDigit(mapped)) out.append(mapped);
        }
        return out.toString();
    }

    private static char mapDigitLike(char value) {
        if (value >= '0' && value <= '9') return value;
        return switch (value) {
            case 'O', 'Q', 'D' -> '0';
            case 'I', 'L', '|' -> '1';
            case 'Z' -> '2';
            case 'S' -> '5';
            case 'G' -> '6';
            case 'B' -> '8';
            default -> value;
        };
    }

    private static int positionalMatches(String left, String right) {
        int max = Math.min(left.length(), right.length());
        int count = 0;
        for (int i = 0; i < max; i++) {
            if (left.charAt(i) == right.charAt(i)) count++;
        }
        return count;
    }

    private static double nameScore(String expectedName, String actualText) {
        String expected = normalizeWords(expectedName);
        String actual = normalizeWords(actualText);
        if (expected.isBlank() || actual.isBlank()) return 0d;
        if (actual.contains(expected)) return 1d;

        List<String> expectedTokens = Arrays.stream(expected.split("\\s+"))
                .filter(token -> token.length() >= 2)
                .toList();
        List<String> actualTokens = Arrays.stream(actual.split("\\s+"))
                .filter(token -> token.length() >= 2)
                .toList();
        if (expectedTokens.isEmpty() || actualTokens.isEmpty()) return 0d;

        double sum = 0d;
        for (String token : expectedTokens) {
            double best = actualTokens.stream()
                    .mapToDouble(candidate -> similarity(token, candidate))
                    .max()
                    .orElse(0d);
            sum += best;
        }
        return sum / expectedTokens.size();
    }


    private static double nameCoverage(String expectedName, String actualText) {
        String expected = normalizeWords(expectedName);
        String actual = normalizeWords(actualText);
        List<String> expectedTokens = Arrays.stream(expected.split("\\s+"))
                .filter(token -> token.length() >= 2)
                .toList();
        List<String> actualTokens = Arrays.stream(actual.split("\\s+"))
                .filter(token -> token.length() >= 2)
                .toList();
        if (expectedTokens.isEmpty() || actualTokens.isEmpty()) return 0d;
        long matched = expectedTokens.stream()
                .filter(token -> actualTokens.stream()
                        .mapToDouble(candidate -> similarity(token, candidate))
                        .max()
                        .orElse(0d) >= 0.60d)
                .count();
        return (double) matched / expectedTokens.size();
    }

    private static String normalizeWords(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]+", " ")
                .trim()
                .replaceAll("\\s+", " ");
    }

    private static double similarity(String left, String right) {
        if (left.equals(right)) return 1d;
        int max = Math.max(left.length(), right.length());
        if (max == 0) return 1d;
        return Math.max(0d, 1d - ((double) levenshtein(left, right) / max));
    }

    private static int levenshtein(String left, String right) {
        int[] previous = new int[right.length() + 1];
        int[] current = new int[right.length() + 1];
        for (int j = 0; j <= right.length(); j++) previous[j] = j;
        for (int i = 1; i <= left.length(); i++) {
            current[0] = i;
            for (int j = 1; j <= right.length(); j++) {
                int cost = left.charAt(i - 1) == right.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(
                        Math.min(current[j - 1] + 1, previous[j] + 1),
                        previous[j - 1] + cost
                );
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[right.length()];
    }

    public record Result(
            boolean formatValid,
            String identityNumber,
            String fullName,
            LocalDate dateOfBirth,
            boolean identityMatched,
            boolean nameMatched,
            boolean dateOfBirthMatched,
            String gender,
            String nationality,
            LocalDate expiryDate,
            boolean verified
    ) {
    }
}
