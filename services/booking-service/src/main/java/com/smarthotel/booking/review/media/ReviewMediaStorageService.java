package com.smarthotel.booking.review.media;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class ReviewMediaStorageService {

    private static final int MAX_IMAGES = 6;
    private static final Set<String> ALLOWED_TYPES = Set.of(
            MediaType.IMAGE_JPEG_VALUE,
            MediaType.IMAGE_PNG_VALUE,
            "image/webp"
    );

    private final Path uploadDir;
    private final String publicBaseUrl;
    private final long maxFileSizeBytes;

    public ReviewMediaStorageService(
            @Value("${reviews.media.upload-dir}") String uploadDir,
            @Value("${reviews.media.public-base-url}") String publicBaseUrl,
            @Value("${reviews.media.max-file-size-bytes:5242880}") long maxFileSizeBytes
    ) {
        this.uploadDir = Path.of(uploadDir).toAbsolutePath().normalize();
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
        this.maxFileSizeBytes = maxFileSizeBytes;
    }

    @PostConstruct
    void init() throws IOException {
        Files.createDirectories(uploadDir);
    }

    public List<String> store(List<MultipartFile> files) {
        if (files == null || files.isEmpty()) {
            return List.of();
        }

        List<MultipartFile> actual = files.stream()
                .filter(file -> file != null && !file.isEmpty())
                .toList();

        if (actual.size() > MAX_IMAGES) {
            throw new IllegalArgumentException("Mỗi đánh giá chỉ được tải tối đa 6 ảnh");
        }

        List<String> urls = new ArrayList<>();
        List<Path> storedPaths = new ArrayList<>();

        try {
            for (MultipartFile file : actual) {
                validate(file);

                String extension = extension(file);
                String filename = UUID.randomUUID().toString().replace("-", "")
                        + extension;
                Path target = uploadDir.resolve(filename).normalize();

                if (!target.startsWith(uploadDir)) {
                    throw new IllegalArgumentException("Tên file không hợp lệ");
                }

                Files.copy(
                        file.getInputStream(),
                        target,
                        StandardCopyOption.REPLACE_EXISTING
                );
                storedPaths.add(target);
                urls.add(publicBaseUrl + "/" + filename);
            }
            return urls;
        } catch (IOException | RuntimeException exception) {
            storedPaths.forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                }
            });
            if (exception instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new IllegalStateException("Không thể lưu ảnh đánh giá", exception);
        }
    }

    public Resource load(String filename) {
        if (!StringUtils.hasText(filename) || filename.contains("..")
                || filename.contains("/") || filename.contains("\\")) {
            throw new IllegalArgumentException("Tên file không hợp lệ");
        }

        Path target = uploadDir.resolve(filename).normalize();
        if (!target.startsWith(uploadDir) || !Files.exists(target)) {
            throw new IllegalArgumentException("Không tìm thấy ảnh đánh giá");
        }

        return new FileSystemResource(target);
    }

    public String contentType(String filename) {
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return MediaType.IMAGE_PNG_VALUE;
        if (lower.endsWith(".webp")) return "image/webp";
        return MediaType.IMAGE_JPEG_VALUE;
    }

    private void validate(MultipartFile file) {
        if (file.getSize() <= 0) {
            throw new IllegalArgumentException("Ảnh đánh giá bị rỗng");
        }
        if (file.getSize() > maxFileSizeBytes) {
            throw new IllegalArgumentException("Mỗi ảnh đánh giá tối đa 5 MB");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP");
        }
    }

    private String extension(MultipartFile file) {
        String contentType = file.getContentType();
        if (MediaType.IMAGE_PNG_VALUE.equalsIgnoreCase(contentType)) return ".png";
        if ("image/webp".equalsIgnoreCase(contentType)) return ".webp";
        return ".jpg";
    }
}
