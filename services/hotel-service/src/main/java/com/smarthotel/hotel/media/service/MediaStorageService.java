package com.smarthotel.hotel.media.service;

import com.smarthotel.hotel.media.config.MediaStorageProperties;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class MediaStorageService {

    private static final Set<String> ALLOWED_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
    );

    private final MediaStorageProperties properties;
    private Path root;

    public MediaStorageService(MediaStorageProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void initialize() {
        try {
            root = Path.of(properties.uploadDir())
                    .toAbsolutePath()
                    .normalize();
            Files.createDirectories(root);
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "Không thể tạo thư mục lưu ảnh",
                    exception
            );
        }
    }

    public StoredFile store(MultipartFile file, String folder) {
        validate(file);

        String extension = getExtension(file.getOriginalFilename());
        String fileName = folder + "-" + UUID.randomUUID() + extension;
        Path target = root.resolve(fileName).normalize();

        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("Tên tệp không hợp lệ");
        }

        try {
            Files.copy(
                    file.getInputStream(),
                    target,
                    StandardCopyOption.REPLACE_EXISTING
            );

            return new StoredFile(
                    fileName,
                    sanitizeOriginalName(file.getOriginalFilename()),
                    file.getContentType(),
                    file.getSize()
            );
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "Không thể lưu ảnh " + file.getOriginalFilename(),
                    exception
            );
        }
    }

    public Resource load(String fileName) {
        try {
            Path file = root.resolve(fileName).normalize();

            if (!file.startsWith(root)) {
                throw new IllegalArgumentException("Tên tệp không hợp lệ");
            }

            Resource resource = new UrlResource(file.toUri());

            if (!resource.exists() || !resource.isReadable()) {
                throw new IllegalArgumentException("Không tìm thấy ảnh");
            }

            return resource;
        } catch (MalformedURLException exception) {
            throw new IllegalArgumentException("Tên tệp không hợp lệ", exception);
        }
    }

    public void delete(String fileName) {
        try {
            Files.deleteIfExists(root.resolve(fileName).normalize());
        } catch (IOException exception) {
            throw new IllegalStateException("Không thể xóa ảnh", exception);
        }
    }

    public String publicUrl(String fileName) {
        return properties.publicBaseUrl() + "/" + fileName;
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Ảnh tải lên không được để trống");
        }

        if (file.getSize() > properties.maxFileSizeBytes()) {
            throw new IllegalArgumentException("Mỗi ảnh tối đa 10 MB");
        }

        if (file.getContentType() == null
                || !ALLOWED_TYPES.contains(file.getContentType().toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException(
                    "Chỉ hỗ trợ JPG, PNG, WEBP hoặc GIF"
            );
        }
    }

    private String getExtension(String originalName) {
        if (originalName == null) {
            return "";
        }

        int dot = originalName.lastIndexOf('.');
        if (dot < 0) {
            return "";
        }

        return originalName.substring(dot).toLowerCase(Locale.ROOT);
    }

    private String sanitizeOriginalName(String value) {
        if (value == null) {
            return null;
        }

        return Path.of(value).getFileName().toString();
    }

    public record StoredFile(
            String fileName,
            String originalName,
            String contentType,
            long fileSize
    ) {
    }
}
