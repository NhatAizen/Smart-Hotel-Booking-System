package com.smarthotel.booking.complaint.media;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ComplaintEvidenceStorageServiceTest {
    @TempDir Path uploadDir;

    @Test
    void rejectsContentTypeSpoofing() throws Exception {
        ComplaintEvidenceStorageService storage = storage();
        MockMultipartFile spoofed = new MockMultipartFile(
                "evidence", "fake.jpg", "image/jpeg", "not a jpeg".getBytes()
        );

        assertThatThrownBy(() -> storage.store(List.of(spoofed)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("không khớp");
    }

    @Test
    void storesValidFileWithSanitizedOriginalName() throws Exception {
        ComplaintEvidenceStorageService storage = storage();
        byte[] png = new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
        MockMultipartFile valid = new MockMultipartFile(
                "evidence", "C:\\fakepath\\proof.png", "image/png", png
        );

        ComplaintEvidenceStorageService.StoredEvidence result = storage.store(List.of(valid)).get(0);

        assertThat(result.originalFileName()).isEqualTo("proof.png");
        assertThat(storage.load(result.storedFileName()).exists()).isTrue();
    }

    @Test
    void rejectsPathTraversalWhenLoading() throws Exception {
        ComplaintEvidenceStorageService storage = storage();

        assertThatThrownBy(() -> storage.load("../secret.pdf"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("không hợp lệ");
    }

    private ComplaintEvidenceStorageService storage() throws Exception {
        ComplaintEvidenceStorageService storage = new ComplaintEvidenceStorageService(uploadDir.toString(), 10_485_760);
        storage.init();
        return storage;
    }
}
