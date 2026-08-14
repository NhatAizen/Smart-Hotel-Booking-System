package com.smarthotel.identity.partnerrequest.media;

import com.smarthotel.identity.partnerrequest.config.PartnerDocumentProperties;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.UUID;

@Service
public class PartnerDocumentStorageService {

    private final Path root;
    private final long maxFileSizeBytes;

    public PartnerDocumentStorageService(PartnerDocumentProperties properties) {
        this.root = Path.of(properties.uploadDir())
                .toAbsolutePath()
                .normalize();
        this.maxFileSizeBytes = properties.maxFileSizeBytes();

        try {
            Files.createDirectories(root);
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "Không thể khởi tạo thư mục lưu CCCD đối tác",
                    exception
            );
        }
    }

    public StoredDocuments storePair(
            UUID userId,
            MultipartFile front,
            MultipartFile back
    ) {
        validateImage(front, "mặt trước");
        validateImage(back, "mặt sau");

        Path userDir = root.resolve(userId.toString()).normalize();
        ensureInsideRoot(userDir);

        try {
            Files.createDirectories(userDir);

            String frontName = "front-" + UUID.randomUUID() + extension(front);
            String backName = "back-" + UUID.randomUUID() + extension(back);

            Path frontTarget = userDir.resolve(frontName).normalize();
            Path backTarget = userDir.resolve(backName).normalize();
            ensureInsideRoot(frontTarget);
            ensureInsideRoot(backTarget);

            try (InputStream input = front.getInputStream()) {
                Files.copy(input, frontTarget, StandardCopyOption.REPLACE_EXISTING);
            }

            try (InputStream input = back.getInputStream()) {
                Files.copy(input, backTarget, StandardCopyOption.REPLACE_EXISTING);
            }

            return new StoredDocuments(
                    root.relativize(frontTarget).toString().replace('\\', '/'),
                    root.relativize(backTarget).toString().replace('\\', '/')
            );
        } catch (IOException exception) {
            throw new IllegalStateException("Không thể lưu ảnh CCCD", exception);
        }
    }


    public String storeEkycEvidence(
            UUID userId,
            MultipartFile frame
    ) {
        validateEkycEvidence(frame);

        Path evidenceDir = root
                .resolve(userId.toString())
                .resolve("ekyc")
                .normalize();
        ensureInsideRoot(evidenceDir);

        try {
            Files.createDirectories(evidenceDir);
            String fileName = "verified-face-" + UUID.randomUUID() + extension(frame);
            Path target = evidenceDir.resolve(fileName).normalize();
            ensureInsideRoot(target);

            try (InputStream input = frame.getInputStream()) {
                Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING);
            }

            return root.relativize(target).toString().replace('\\', '/');
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "Không thể lưu ảnh bằng chứng eKYC",
                    exception
            );
        }
    }

    private void validateEkycEvidence(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(
                    "Không có ảnh camera eKYC để lưu làm bằng chứng"
            );
        }
        if (file.getSize() > Math.min(maxFileSizeBytes, 5L * 1024L * 1024L)) {
            throw new IllegalArgumentException(
                    "Ảnh camera eKYC vượt quá dung lượng cho phép"
            );
        }

        String contentType = file.getContentType() == null
                ? ""
                : file.getContentType().toLowerCase(Locale.ROOT);
        if (!contentType.equals("image/jpeg") && !contentType.equals("image/png")) {
            throw new IllegalArgumentException(
                    "Ảnh camera eKYC chỉ hỗ trợ JPG/JPEG hoặc PNG"
            );
        }

        try (InputStream input = file.getInputStream()) {
            BufferedImage image = ImageIO.read(input);
            if (image == null) {
                throw new IllegalArgumentException(
                        "Tệp camera eKYC không phải ảnh hợp lệ"
                );
            }
            if (image.getWidth() < 320 || image.getHeight() < 240) {
                throw new IllegalArgumentException(
                        "Ảnh camera eKYC quá nhỏ để lưu làm bằng chứng"
                );
            }
        } catch (IOException exception) {
            throw new IllegalArgumentException(
                    "Không thể đọc ảnh camera eKYC",
                    exception
            );
        }
    }

    public Resource load(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            throw new IllegalArgumentException("Không tìm thấy ảnh CCCD");
        }

        try {
            Path path = root.resolve(relativePath).normalize();
            ensureInsideRoot(path);

            if (!Files.isRegularFile(path)) {
                throw new IllegalArgumentException("Không tìm thấy ảnh CCCD");
            }

            return new UrlResource(path.toUri());
        } catch (IOException exception) {
            throw new IllegalStateException("Không thể đọc ảnh CCCD", exception);
        }
    }

    public String contentType(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return "application/octet-stream";
        }

        try {
            Path path = root.resolve(relativePath).normalize();
            ensureInsideRoot(path);
            String detected = Files.probeContentType(path);
            return detected == null ? "application/octet-stream" : detected;
        } catch (IOException exception) {
            return "application/octet-stream";
        }
    }

    public void deleteQuietly(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return;
        }

        try {
            Path path = root.resolve(relativePath).normalize();
            ensureInsideRoot(path);
            Files.deleteIfExists(path);
        } catch (Exception ignored) {
            // Best-effort cleanup. Không làm hỏng transaction nghiệp vụ.
        }
    }

    public void validateImage(MultipartFile file, String label) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Vui lòng tải ảnh CCCD " + label);
        }

        if (file.getSize() > maxFileSizeBytes) {
            throw new IllegalArgumentException(
                    "Ảnh CCCD " + label + " vượt quá dung lượng cho phép"
            );
        }

        String contentType = file.getContentType() == null
                ? ""
                : file.getContentType().toLowerCase(Locale.ROOT);

        if (!contentType.equals("image/jpeg") && !contentType.equals("image/png")) {
            throw new IllegalArgumentException(
                    "Ảnh CCCD chỉ hỗ trợ JPG/JPEG hoặc PNG"
            );
        }

        try (InputStream input = file.getInputStream()) {
            BufferedImage image = ImageIO.read(input);
            if (image == null) {
                throw new IllegalArgumentException("Tệp CCCD không phải ảnh hợp lệ");
            }

            if (image.getWidth() < 600 || image.getHeight() < 350) {
                throw new IllegalArgumentException(
                        "Ảnh CCCD " + label + " quá nhỏ. Vui lòng dùng ảnh rõ nét hơn"
                );
            }
        } catch (IOException exception) {
            throw new IllegalArgumentException("Không thể đọc ảnh CCCD " + label, exception);
        }
    }

    private String extension(MultipartFile file) {
        String contentType = file.getContentType();
        return "image/png".equalsIgnoreCase(contentType) ? ".png" : ".jpg";
    }

    private void ensureInsideRoot(Path path) {
        if (!path.toAbsolutePath().normalize().startsWith(root)) {
            throw new IllegalArgumentException("Đường dẫn tài liệu không hợp lệ");
        }
    }

    public record StoredDocuments(
            String frontPath,
            String backPath
    ) {
    }
}
