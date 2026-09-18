package com.smarthotel.booking.complaint.media;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class ComplaintEvidenceStorageService {
    private static final int MAX_FILES_PER_REQUEST = 8;
    private static final Set<String> ALLOWED_TYPES = Set.of(
            MediaType.IMAGE_JPEG_VALUE, MediaType.IMAGE_PNG_VALUE, "image/webp",
            MediaType.APPLICATION_PDF_VALUE
    );
    private final Path uploadDir;
    private final long maxFileSizeBytes;

    public ComplaintEvidenceStorageService(
            @Value("${complaints.media.upload-dir:./uploads/complaints}") String uploadDir,
            @Value("${complaints.media.max-file-size-bytes:10485760}") long maxFileSizeBytes
    ) {
        this.uploadDir = Path.of(uploadDir).toAbsolutePath().normalize();
        this.maxFileSizeBytes = maxFileSizeBytes;
    }

    @PostConstruct
    void init() throws IOException { Files.createDirectories(uploadDir); }

    public List<StoredEvidence> store(List<MultipartFile> files) {
        if (files == null) return List.of();
        List<MultipartFile> actual = files.stream().filter(file -> file != null && !file.isEmpty()).toList();
        if (actual.size() > MAX_FILES_PER_REQUEST) {
            throw new IllegalArgumentException("Mỗi lần chỉ được tải tối đa 8 tệp chứng cứ");
        }
        List<Path> storedPaths = new ArrayList<>();
        List<StoredEvidence> result = new ArrayList<>();
        try {
            for (MultipartFile file : actual) {
                validate(file);
                String storedName = UUID.randomUUID().toString().replace("-", "") + extension(file.getContentType());
                Path target = uploadDir.resolve(storedName).normalize();
                if (!target.startsWith(uploadDir)) throw new IllegalArgumentException("Tên tệp không hợp lệ");
                Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
                storedPaths.add(target);
                String original = safeOriginalName(file.getOriginalFilename());
                result.add(new StoredEvidence(original, storedName, file.getContentType(), file.getSize()));
            }
            return result;
        } catch (IOException | RuntimeException exception) {
            storedPaths.forEach(path -> { try { Files.deleteIfExists(path); } catch (IOException ignored) {} });
            if (exception instanceof RuntimeException runtimeException) throw runtimeException;
            throw new IllegalStateException("Không thể lưu chứng cứ khiếu nại", exception);
        }
    }

    public Resource load(String storedName) {
        if (storedName == null || storedName.isBlank() || storedName.contains("..")
                || storedName.contains("/") || storedName.contains("\\")) {
            throw new IllegalArgumentException("Tên tệp không hợp lệ");
        }
        Path target = uploadDir.resolve(storedName).normalize();
        if (!target.startsWith(uploadDir) || !Files.exists(target)) {
            throw new IllegalArgumentException("Không tìm thấy chứng cứ");
        }
        return new FileSystemResource(target);
    }

    private void validate(MultipartFile file) {
        String type = file.getContentType();
        if (file.getSize() <= 0) throw new IllegalArgumentException("Tệp chứng cứ bị rỗng");
        if (file.getSize() > maxFileSizeBytes) throw new IllegalArgumentException("Mỗi tệp chứng cứ tối đa 10 MB");
        if (type == null || !ALLOWED_TYPES.contains(type.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Chứng cứ chỉ hỗ trợ JPG, PNG, WEBP hoặc PDF");
        }
        if (!hasExpectedSignature(file, type)) {
            throw new IllegalArgumentException("Nội dung tệp không khớp với định dạng đã khai báo");
        }
    }

    private String safeOriginalName(String value) {
        String normalized = value == null ? "" : value.replace('\\', '/');
        String name = normalized.substring(normalized.lastIndexOf('/') + 1)
                .replaceAll("[\\p{Cntrl}]", "_").trim();
        return name.isEmpty() ? "evidence" : name.substring(0, Math.min(name.length(), 255));
    }

    private boolean hasExpectedSignature(MultipartFile file, String type) {
        byte[] header = new byte[12];
        int length;
        try (InputStream input = file.getInputStream()) {
            length = input.read(header);
        } catch (IOException exception) {
            throw new IllegalArgumentException("Không thể đọc nội dung tệp chứng cứ", exception);
        }
        if (MediaType.IMAGE_JPEG_VALUE.equalsIgnoreCase(type)) {
            return length >= 3 && unsigned(header[0]) == 0xFF && unsigned(header[1]) == 0xD8
                    && unsigned(header[2]) == 0xFF;
        }
        if (MediaType.IMAGE_PNG_VALUE.equalsIgnoreCase(type)) {
            return length >= 8 && unsigned(header[0]) == 0x89 && header[1] == 'P' && header[2] == 'N'
                    && header[3] == 'G' && unsigned(header[4]) == 0x0D && unsigned(header[5]) == 0x0A
                    && unsigned(header[6]) == 0x1A && unsigned(header[7]) == 0x0A;
        }
        if ("image/webp".equalsIgnoreCase(type)) {
            return length >= 12 && header[0] == 'R' && header[1] == 'I' && header[2] == 'F'
                    && header[3] == 'F' && header[8] == 'W' && header[9] == 'E'
                    && header[10] == 'B' && header[11] == 'P';
        }
        return length >= 5 && header[0] == '%' && header[1] == 'P' && header[2] == 'D'
                && header[3] == 'F' && header[4] == '-';
    }

    private int unsigned(byte value) { return value & 0xFF; }
    private String extension(String type) {
        if (MediaType.IMAGE_PNG_VALUE.equalsIgnoreCase(type)) return ".png";
        if ("image/webp".equalsIgnoreCase(type)) return ".webp";
        if (MediaType.APPLICATION_PDF_VALUE.equalsIgnoreCase(type)) return ".pdf";
        return ".jpg";
    }
    public record StoredEvidence(String originalFileName, String storedFileName, String contentType, long fileSize) {}
}
