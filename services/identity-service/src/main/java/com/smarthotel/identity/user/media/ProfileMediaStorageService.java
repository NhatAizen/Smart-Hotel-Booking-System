package com.smarthotel.identity.user.media;

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
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class ProfileMediaStorageService {

    private static final String SAME_ORIGIN_MEDIA_PATH = "/api/users/media";

    private static final Set<String> ALLOWED_TYPES = Set.of(
            MediaType.IMAGE_JPEG_VALUE,
            MediaType.IMAGE_PNG_VALUE,
            "image/webp"
    );

    private final Path uploadDir;
    private final String publicBaseUrl;
    private final long maxFileSizeBytes;

    public ProfileMediaStorageService(
            @Value("${profiles.media.upload-dir}") String uploadDir,
            @Value("${profiles.media.public-base-url}") String publicBaseUrl,
            @Value("${profiles.media.max-file-size-bytes:5242880}") long maxFileSizeBytes
    ) {
        this.uploadDir = Path.of(uploadDir).toAbsolutePath().normalize();
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
        this.maxFileSizeBytes = maxFileSizeBytes;
    }

    @PostConstruct
    void init() throws IOException {
        Files.createDirectories(uploadDir);
    }

    public String storeAvatar(MultipartFile file) {
        validate(file);

        String filename = "avatar-"
                + UUID.randomUUID().toString().replace("-", "")
                + extension(file);
        Path target = uploadDir.resolve(filename).normalize();

        if (!target.startsWith(uploadDir)) {
            throw new IllegalArgumentException("Tên file ảnh đại diện không hợp lệ");
        }

        try {
            Files.copy(
                    file.getInputStream(),
                    target,
                    StandardCopyOption.REPLACE_EXISTING
            );
        } catch (IOException exception) {
            throw new IllegalStateException("Không thể lưu ảnh đại diện", exception);
        }

        return SAME_ORIGIN_MEDIA_PATH + "/" + filename;
    }

    public void deleteByPublicUrl(String publicUrl) {
        if (!StringUtils.hasText(publicUrl)) {
            return;
        }

        String filename = filenameFromPublicUrl(publicUrl);
        if (!safeFilename(filename)) {
            return;
        }

        try {
            Files.deleteIfExists(uploadDir.resolve(filename).normalize());
        } catch (IOException ignored) {
            // Ảnh cũ không ảnh hưởng việc cập nhật hồ sơ mới.
        }
    }

    public Resource load(String filename) {
        if (!safeFilename(filename)) {
            throw new IllegalArgumentException("Tên file ảnh đại diện không hợp lệ");
        }

        Path target = uploadDir.resolve(filename).normalize();
        if (!target.startsWith(uploadDir) || !Files.exists(target)) {
            throw new IllegalArgumentException("Không tìm thấy ảnh đại diện");
        }

        return new FileSystemResource(target);
    }

    public String contentType(String filename) {
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) {
            return MediaType.IMAGE_PNG_VALUE;
        }
        if (lower.endsWith(".webp")) {
            return "image/webp";
        }
        return MediaType.IMAGE_JPEG_VALUE;
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Vui lòng chọn ảnh đại diện");
        }

        if (file.getSize() > maxFileSizeBytes) {
            throw new IllegalArgumentException("Ảnh đại diện tối đa 5 MB");
        }

        String contentType = file.getContentType();
        if (contentType == null
                || !ALLOWED_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP");
        }
    }

    private String extension(MultipartFile file) {
        String contentType = file.getContentType();
        if (MediaType.IMAGE_PNG_VALUE.equalsIgnoreCase(contentType)) {
            return ".png";
        }
        if ("image/webp".equalsIgnoreCase(contentType)) {
            return ".webp";
        }
        return ".jpg";
    }

    private boolean safeFilename(String filename) {
        return StringUtils.hasText(filename)
                && !filename.contains("..")
                && !filename.contains("/")
                && !filename.contains("\\");
    }

    private String filenameFromPublicUrl(String publicUrl) {
        String normalized = publicUrl.replace('\\', '/');
        String mediaPrefix = SAME_ORIGIN_MEDIA_PATH + "/";
        int mediaIndex = normalized.indexOf(mediaPrefix);

        if (mediaIndex >= 0) {
            return normalized.substring(mediaIndex + mediaPrefix.length());
        }

        String configuredPrefix = publicBaseUrl + "/";
        if (normalized.startsWith(configuredPrefix)) {
            return normalized.substring(configuredPrefix.length());
        }

        return null;
    }
}
