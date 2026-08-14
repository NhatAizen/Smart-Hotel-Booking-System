package com.smarthotel.identity.partnerrequest.ocr;

import com.smarthotel.identity.partnerrequest.config.OcrProperties;
import com.smarthotel.identity.partnerrequest.media.PartnerDocumentStorageService;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class PartnerOcrService {

    private static final Pattern DATE_PATTERN = Pattern.compile(
            "(?<!\\d)([0-3]?\\d)\\s*[./-]\\s*([01]?\\d)\\s*[./-]\\s*((?:19|20)\\d{2})(?!\\d)"
    );

    private static final Pattern ID_PATTERN = Pattern.compile(
            "(?<!\\d)(?:\\d[\\s.]*){12}(?!\\d)"
    );

    // Tesseract thường nhầm O/0, I/1, S/5... trên số in nhỏ của CCCD.
    private static final Pattern FUZZY_ID_PATTERN = Pattern.compile(
            "(?i)(?<![A-Z0-9])(?:[0-9OQILSZGB|][\\s.\\-]*){12,16}(?![A-Z0-9])"
    );

    private final OcrProperties properties;
    private final PartnerDocumentStorageService storageService;

    public PartnerOcrService(
            OcrProperties properties,
            PartnerDocumentStorageService storageService
    ) {
        this.properties = properties;
        this.storageService = storageService;
    }

    public PartnerOcrResult verify(
            MultipartFile front,
            MultipartFile back,
            String submittedIdentityNumber,
            String submittedFullName,
            LocalDate submittedDateOfBirth
    ) {
        storageService.validateImage(front, "mặt trước");
        // Mặt sau bắt buộc OCR vùng MRZ để xác nhận hai ảnh thuộc cùng một CCCD.
        storageService.validateImage(back, "mặt sau");

        String normalizedIdentity = normalizeIdentity(submittedIdentityNumber);
        validateSubmittedIdentity(normalizedIdentity);

        if (submittedFullName == null || submittedFullName.isBlank()) {
            throw new PartnerOcrVerificationException(
                    "Vui lòng nhập họ tên đúng như trên CCCD"
            );
        }
        if (submittedDateOfBirth == null) {
            throw new PartnerOcrVerificationException(
                    "Vui lòng nhập ngày sinh đúng như trên CCCD"
            );
        }

        Path frontTemp = null;
        Path backTemp = null;
        List<Path> generatedVariants = new ArrayList<>();

        try {
            frontTemp = copyToTemp(front, "cccd-front-");
            backTemp = copyToTemp(back, "cccd-back-");

            // Multi-pass OCR: PSM 6 tốt cho khối văn bản, PSM 11 tốt cho CCCD có nhiều vùng rời.
            // Ảnh được tăng tương phản + nhị phân hóa để xử lý ảnh điện thoại hơi tối/lóa.
            String frontText = runMultiPassOcr(frontTemp, generatedVariants);
            String backText = runMultiPassOcr(backTemp, generatedVariants);
            String focusedMrzText = runFocusedMrzOcr(backTemp, generatedVariants);
            if (!focusedMrzText.isBlank()) {
                backText = backText.isBlank()
                        ? focusedMrzText
                        : backText + "\n" + focusedMrzText;
            }

            if (frontText.isBlank() || frontText.length() < 20) {
                throw new PartnerOcrVerificationException(
                        "OCR không đọc được mặt trước CCCD. Hãy chụp đủ 4 góc, đặt thẻ thẳng, đủ sáng và tránh lóa"
                );
            }

            if (backText.isBlank() || backText.length() < 20) {
                throw new PartnerOcrVerificationException(
                        "OCR không đọc được mặt sau CCCD. Hãy chụp rõ phần MRZ/2-3 dòng ký tự ở cạnh dưới, giữ thẻ thẳng và tránh lóa"
                );
            }

            Set<String> identities = extractIdentityNumbers(frontText);
            String extractedIdentity = identities.stream()
                    .filter(normalizedIdentity::equals)
                    .findFirst()
                    .orElseGet(() -> identities.stream().findFirst().orElse(null));

            boolean identityMatched = identities.contains(normalizedIdentity);
            if (!identityMatched) {
                throw new PartnerOcrVerificationException(
                        identities.isEmpty()
                                ? "OCR chưa đọc chắc chắn được số CCCD 12 chữ số. Hãy chụp thẻ gần hơn, rõ nét hơn và không lóa phần số CCCD"
                                : "Số CCCD nhập vào không khớp với số hệ thống đọc được trên ảnh"
                );
            }

            LocalDate extractedDob = extractDateOfBirth(frontText, submittedDateOfBirth);
            boolean dobMatched = submittedDateOfBirth.equals(extractedDob);
            if (!dobMatched) {
                throw new PartnerOcrVerificationException(
                        extractedDob == null
                                ? "OCR chưa đọc chắc chắn được ngày sinh. Hãy chụp rõ vùng Ngày sinh/Date of birth trên mặt trước CCCD"
                                : "Ngày sinh nhập vào không khớp với ngày sinh hệ thống đọc được trên CCCD"
                );
            }

            double nameScore = nameMatchScore(submittedFullName, frontText);
            boolean nameMatched = nameScore >= 0.72d;
            if (!nameMatched) {
                throw new PartnerOcrVerificationException(
                        "Họ tên nhập vào chưa khớp đủ với nội dung OCR trên CCCD. Hãy nhập đúng họ tên có trên thẻ hoặc chụp ảnh rõ hơn"
                );
            }

            PartnerMrzParser.Result backSideResult = PartnerMrzParser.parse(
                    backText,
                    normalizedIdentity,
                    submittedFullName,
                    submittedDateOfBirth
            );

            // Sau khi đã match bằng OCR, giữ chính tả pháp lý do người dùng nhập để
            // tránh hiển thị chuỗi mất dấu/ký tự lỗi từ Tesseract trong hồ sơ Admin.
            String extractedName = submittedFullName.trim();

            if (!backSideResult.verified()) {
                throw new PartnerOcrVerificationException(
                        "Mặt sau CCCD chưa vượt qua kiểm tra OCR/MRZ. Hãy chụp lại rõ hơn phần MRZ ở cạnh dưới"
                );
            }

            return new PartnerOcrResult(
                    extractedIdentity,
                    extractedName,
                    extractedDob,
                    true,
                    true,
                    true,
                    backSideResult.formatValid(),
                    backSideResult.identityNumber(),
                    backSideResult.fullName(),
                    backSideResult.dateOfBirth(),
                    backSideResult.identityMatched(),
                    backSideResult.nameMatched(),
                    backSideResult.dateOfBirthMatched(),
                    backSideResult.gender(),
                    backSideResult.nationality(),
                    backSideResult.expiryDate(),
                    backSideResult.verified(),
                    true
            );
        } catch (PartnerOcrVerificationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new PartnerOcrVerificationException(
                    "Không thể xử lý OCR CCCD. Vui lòng thử lại với ảnh JPG/PNG rõ nét",
                    exception
            );
        } finally {
            deleteTemp(frontTemp);
            deleteTemp(backTemp);
            generatedVariants.forEach(this::deleteTemp);
        }
    }

    private String runMultiPassOcr(Path original, List<Path> generatedVariants)
            throws IOException, InterruptedException {
        StringBuilder combined = new StringBuilder();

        appendOcr(combined, runTesseractPass(original, 6, null));
        appendOcr(combined, runTesseractPass(original, 11, null));

        ImageVariants variants = createImageVariants(original);
        if (variants.enhanced() != null) {
            generatedVariants.add(variants.enhanced());
            appendOcr(combined, runTesseractPass(variants.enhanced(), 11, null));
            // Một lượt chỉ ưu tiên ký tự thường gặp ở số/date để giảm nhầm O/0, I/1.
            appendOcr(
                    combined,
                    runTesseractPass(
                            variants.enhanced(),
                            11,
                            "0123456789OQILSZGB|./- "
                    )
            );
        }

        if (variants.binary() != null) {
            generatedVariants.add(variants.binary());
            appendOcr(combined, runTesseractPass(variants.binary(), 11, null));
        }

        return combined.toString().trim();
    }

    private String runFocusedMrzOcr(Path original, List<Path> generatedVariants)
            throws IOException, InterruptedException {
        BufferedImage source = ImageIO.read(original.toFile());
        if (source == null || source.getWidth() < 200 || source.getHeight() < 120) {
            return "";
        }

        // MRZ của CCCD Việt Nam nằm ở nửa dưới mặt sau. OCR toàn bộ thẻ dễ bị
        // nhiễu bởi vân tay, con dấu và chữ hướng dẫn, nên cắt riêng vùng này.
        int x = Math.max(0, (int) Math.round(source.getWidth() * 0.03d));
        int y = Math.max(0, (int) Math.round(source.getHeight() * 0.50d));
        int width = Math.min(
                source.getWidth() - x,
                Math.max(1, (int) Math.round(source.getWidth() * 0.94d))
        );
        int height = Math.min(
                source.getHeight() - y,
                Math.max(1, (int) Math.round(source.getHeight() * 0.48d))
        );

        BufferedImage crop = source.getSubimage(x, y, width, height);

        // Phóng lớn vùng MRZ trước khi đưa vào Tesseract. Điều này đặc biệt hữu ích
        // với ảnh chụp điện thoại nhìn bằng mắt rõ nhưng ký tự MRZ chỉ cao vài pixel.
        double scale = Math.max(1.0d, Math.min(3.2d, 1800.0d / Math.max(1, crop.getWidth())));
        int scaledWidth = Math.max(1, (int) Math.round(crop.getWidth() * scale));
        int scaledHeight = Math.max(1, (int) Math.round(crop.getHeight() * scale));
        BufferedImage scaled = new BufferedImage(
                scaledWidth,
                scaledHeight,
                BufferedImage.TYPE_INT_RGB
        );

        for (int targetY = 0; targetY < scaledHeight; targetY++) {
            int sourceY = Math.min(
                    crop.getHeight() - 1,
                    (int) Math.floor((double) targetY * crop.getHeight() / scaledHeight)
            );
            for (int targetX = 0; targetX < scaledWidth; targetX++) {
                int sourceX = Math.min(
                        crop.getWidth() - 1,
                        (int) Math.floor((double) targetX * crop.getWidth() / scaledWidth)
                );
                scaled.setRGB(targetX, targetY, crop.getRGB(sourceX, sourceY));
            }
        }

        Path cropPath = Files.createTempFile("cccd-mrz-crop-", ".png");
        ImageIO.write(scaled, "png", cropPath.toFile());
        generatedVariants.add(cropPath);

        StringBuilder combined = new StringBuilder();
        String mrzWhitelist = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";
        appendOcr(combined, runTesseractPass(cropPath, 6, mrzWhitelist));
        appendOcr(combined, runTesseractPass(cropPath, 11, mrzWhitelist));

        ImageVariants variants = createImageVariants(cropPath);
        if (variants.enhanced() != null) {
            generatedVariants.add(variants.enhanced());
            appendOcr(combined, runTesseractPass(variants.enhanced(), 6, mrzWhitelist));
            appendOcr(combined, runTesseractPass(variants.enhanced(), 11, mrzWhitelist));
        }
        if (variants.binary() != null) {
            generatedVariants.add(variants.binary());
            appendOcr(combined, runTesseractPass(variants.binary(), 6, mrzWhitelist));
        }

        return combined.toString().trim();
    }

    private void appendOcr(StringBuilder combined, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        if (!combined.isEmpty()) {
            combined.append('\n');
        }
        combined.append(value.trim());
    }

    private String runTesseractPass(Path imagePath, int psm, String whitelist)
            throws IOException, InterruptedException {
        List<String> command = new ArrayList<>();
        command.add(properties.command());
        command.add(imagePath.toString());
        command.add("stdout");
        command.add("-l");
        command.add(properties.languages());
        command.add("--psm");
        command.add(String.valueOf(psm));
        if (whitelist != null && !whitelist.isBlank()) {
            command.add("-c");
            command.add("tessedit_char_whitelist=" + whitelist);
        }

        Process process = new ProcessBuilder(command)
                .redirectErrorStream(true)
                .start();

        boolean finished = process.waitFor(
                properties.timeoutSeconds(),
                TimeUnit.SECONDS
        );

        if (!finished) {
            process.destroyForcibly();
            return "";
        }

        String output = new String(
                process.getInputStream().readAllBytes(),
                StandardCharsets.UTF_8
        ).trim();

        // Một pass OCR lỗi không làm hỏng toàn bộ quá trình; các pass khác vẫn có thể đọc tốt.
        return process.exitValue() == 0 ? output : "";
    }

    private ImageVariants createImageVariants(Path imagePath) throws IOException {
        BufferedImage source = ImageIO.read(imagePath.toFile());
        if (source == null) {
            return new ImageVariants(null, null);
        }

        double scale = 1.0d;
        if (source.getWidth() < 1400) {
            scale = Math.min(2.5d, 1400.0d / Math.max(1, source.getWidth()));
        } else if (source.getWidth() > 2200) {
            scale = 2200.0d / source.getWidth();
        }
        if (source.getHeight() * scale > 1600) {
            scale = Math.min(scale, 1600.0d / source.getHeight());
        }

        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));

        // Scale thủ công để chạy ổn định trong Docker headless, không phụ thuộc X11/AWT GraphicsEnvironment.
        BufferedImage scaled = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < height; y++) {
            int sourceY = Math.min(
                    source.getHeight() - 1,
                    (int) Math.floor((double) y * source.getHeight() / height)
            );
            for (int x = 0; x < width; x++) {
                int sourceX = Math.min(
                        source.getWidth() - 1,
                        (int) Math.floor((double) x * source.getWidth() / width)
                );
                scaled.setRGB(x, y, source.getRGB(sourceX, sourceY));
            }
        }

        int[] histogram = new int[256];
        int[] grayValues = new int[width * height];
        int cursor = 0;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = scaled.getRGB(x, y);
                int r = (rgb >> 16) & 0xff;
                int g = (rgb >> 8) & 0xff;
                int b = rgb & 0xff;
                int gray = (r * 30 + g * 59 + b * 11) / 100;
                grayValues[cursor++] = gray;
                histogram[gray]++;
            }
        }

        int low = percentile(histogram, grayValues.length, 0.02d);
        int high = percentile(histogram, grayValues.length, 0.98d);
        if (high <= low + 10) {
            low = 0;
            high = 255;
        }

        BufferedImage enhanced = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
        int[] enhancedHistogram = new int[256];
        cursor = 0;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int gray = grayValues[cursor++];
                int stretched = clamp((gray - low) * 255 / Math.max(1, high - low));
                enhancedHistogram[stretched]++;
                int rgb = (stretched << 16) | (stretched << 8) | stretched;
                enhanced.setRGB(x, y, rgb);
            }
        }

        int threshold = otsuThreshold(enhancedHistogram, grayValues.length);
        BufferedImage binary = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_BINARY);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int gray = enhanced.getRGB(x, y) & 0xff;
                int value = gray >= threshold ? 255 : 0;
                int rgb = (value << 16) | (value << 8) | value;
                binary.setRGB(x, y, rgb);
            }
        }

        Path enhancedPath = Files.createTempFile("cccd-enhanced-", ".png");
        Path binaryPath = Files.createTempFile("cccd-binary-", ".png");
        ImageIO.write(enhanced, "png", enhancedPath.toFile());
        ImageIO.write(binary, "png", binaryPath.toFile());
        return new ImageVariants(enhancedPath, binaryPath);
    }

    private int percentile(int[] histogram, int total, double ratio) {
        int target = Math.max(1, (int) Math.round(total * ratio));
        int cumulative = 0;
        for (int value = 0; value < histogram.length; value++) {
            cumulative += histogram[value];
            if (cumulative >= target) {
                return value;
            }
        }
        return 255;
    }

    private int otsuThreshold(int[] histogram, int total) {
        long weightedSum = 0L;
        for (int value = 0; value < 256; value++) {
            weightedSum += (long) value * histogram[value];
        }

        long backgroundSum = 0L;
        int backgroundWeight = 0;
        double bestVariance = -1d;
        int bestThreshold = 128;

        for (int value = 0; value < 256; value++) {
            backgroundWeight += histogram[value];
            if (backgroundWeight == 0) continue;

            int foregroundWeight = total - backgroundWeight;
            if (foregroundWeight <= 0) break;

            backgroundSum += (long) value * histogram[value];
            double backgroundMean = (double) backgroundSum / backgroundWeight;
            double foregroundMean = (double) (weightedSum - backgroundSum) / foregroundWeight;
            double between = (double) backgroundWeight
                    * foregroundWeight
                    * Math.pow(backgroundMean - foregroundMean, 2);

            if (between > bestVariance) {
                bestVariance = between;
                bestThreshold = value;
            }
        }

        return bestThreshold;
    }

    private int clamp(int value) {
        return Math.max(0, Math.min(255, value));
    }

    private Path copyToTemp(MultipartFile file, String prefix) throws IOException {
        String suffix = "image/png".equalsIgnoreCase(file.getContentType())
                ? ".png"
                : ".jpg";
        Path temp = Files.createTempFile(prefix, suffix);
        file.transferTo(temp);
        return temp;
    }

    private Set<String> extractIdentityNumbers(String text) {
        Set<String> result = new LinkedHashSet<>();

        Matcher matcher = ID_PATTERN.matcher(text);
        while (matcher.find()) {
            String candidate = matcher.group().replaceAll("\\D", "");
            if (candidate.length() == 12 && !allDigitsSame(candidate)) {
                result.add(candidate);
            }
        }

        Matcher fuzzyMatcher = FUZZY_ID_PATTERN.matcher(text);
        while (fuzzyMatcher.find()) {
            String candidate = normalizeOcrDigits(fuzzyMatcher.group());
            if (candidate.length() == 12 && !allDigitsSame(candidate)) {
                result.add(candidate);
            }
        }

        return result;
    }

    private LocalDate extractDateOfBirth(String text, LocalDate submitted) {
        // Ưu tiên đúng ngày người dùng khai nếu OCR đọc được cùng giá trị ở bất kỳ pass nào.
        String submittedDigits = submitted.format(DateTimeFormatter.ofPattern("ddMMyyyy"));
        for (String line : text.split("\\R")) {
            String lineDigits = normalizeOcrDigits(line);
            if (lineDigits.contains(submittedDigits)) {
                return submitted;
            }
        }

        String corrected = normalizeDateConfusions(text);
        List<LocalDate> dates = new ArrayList<>();
        Matcher matcher = DATE_PATTERN.matcher(corrected);

        while (matcher.find()) {
            String value = matcher.group(1) + "/" + matcher.group(2) + "/" + matcher.group(3);
            try {
                LocalDate parsed = LocalDate.parse(
                        value,
                        DateTimeFormatter.ofPattern("d/M/uuuu")
                );
                if (!parsed.isAfter(LocalDate.now()) && parsed.getYear() >= 1900) {
                    dates.add(parsed);
                }
            } catch (DateTimeParseException ignored) {
                // Ignore non-date OCR fragments.
            }
        }

        return dates.stream()
                .filter(submitted::equals)
                .findFirst()
                .orElseGet(() -> dates.stream().findFirst().orElse(null));
    }

    private String extractName(String text, String submittedName) {
        String bestLine = null;
        double bestScore = 0d;

        for (String rawLine : text.split("\\R")) {
            String line = rawLine.trim();
            if (line.length() < 4 || !line.matches(".*[A-Za-zÀ-ỹ].*")) {
                continue;
            }

            double score = lineNameScore(submittedName, line);
            if (score > bestScore) {
                bestScore = score;
                bestLine = line;
            }
        }

        return bestScore >= 0.50d ? bestLine : null;
    }

    private double nameMatchScore(String submittedName, String ocrText) {
        String normalizedName = normalizeText(submittedName);
        String normalizedOcr = normalizeText(ocrText);

        if (normalizedName.isBlank()) {
            return 0d;
        }
        if (normalizedOcr.contains(normalizedName)) {
            return 1d;
        }

        // Tên phải xuất hiện gần nhau trên cùng một dòng OCR. Không cộng token rải rác
        // khắp CCCD vì các từ như NAM/VAN có thể xuất hiện ở trường giới tính/quốc tịch.
        double bestLineScore = 0d;
        for (String line : ocrText.split("\\R")) {
            if (line == null || line.isBlank()) continue;
            bestLineScore = Math.max(bestLineScore, lineNameScore(submittedName, line));
        }
        return bestLineScore;
    }

    private double lineNameScore(String submittedName, String line) {
        String expected = normalizeText(submittedName);
        String actual = normalizeText(line);
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
                    .mapToDouble(actualToken -> similarity(token, actualToken))
                    .max()
                    .orElse(0d);
            sum += best;
        }
        return sum / expectedTokens.size();
    }

    private double similarity(String left, String right) {
        if (left.equals(right)) return 1d;
        int max = Math.max(left.length(), right.length());
        if (max == 0) return 1d;
        int distance = levenshtein(left, right);
        return Math.max(0d, 1d - ((double) distance / max));
    }

    private int levenshtein(String left, String right) {
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

    private String normalizeIdentity(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    private void validateSubmittedIdentity(String identity) {
        if (!identity.matches("\\d{12}")) {
            throw new PartnerOcrVerificationException(
                    "CCCD phải gồm đúng 12 chữ số"
            );
        }

        if (allDigitsSame(identity)) {
            throw new PartnerOcrVerificationException(
                    "Số CCCD không hợp lệ"
            );
        }
    }

    private boolean allDigitsSame(String value) {
        return !value.isEmpty() && value.chars().allMatch(ch -> ch == value.charAt(0));
    }

    private String normalizeOcrDigits(String value) {
        if (value == null) return "";
        StringBuilder digits = new StringBuilder();
        for (char raw : value.toUpperCase(Locale.ROOT).toCharArray()) {
            char mapped = mapDigitLike(raw);
            if (Character.isDigit(mapped)) {
                digits.append(mapped);
            }
        }
        return digits.toString();
    }

    private char mapDigitLike(char value) {
        if (value >= '0' && value <= '9') return value;
        return switch (value) {
            case 'O', 'Q' -> '0';
            case 'I', 'L', '|' -> '1';
            case 'Z' -> '2';
            case 'S' -> '5';
            case 'G' -> '6';
            case 'B' -> '8';
            default -> '\0';
        };
    }

    private String normalizeDateConfusions(String value) {
        if (value == null) return "";
        String upper = value.toUpperCase(Locale.ROOT);
        return upper
                .replace('O', '0')
                .replace('Q', '0')
                .replace('I', '1')
                .replace('L', '1')
                .replace('|', '1')
                .replace('Z', '2')
                .replace('S', '5')
                .replace('G', '6')
                .replace('B', '8');
    }

    private String normalizeText(String value) {
        if (value == null) {
            return "";
        }

        return Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9 ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private void deleteTemp(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // Best-effort cleanup.
        }
    }

    private record ImageVariants(Path enhanced, Path binary) {
    }
}
