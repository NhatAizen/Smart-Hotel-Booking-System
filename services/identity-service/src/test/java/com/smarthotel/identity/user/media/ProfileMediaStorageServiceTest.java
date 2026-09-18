package com.smarthotel.identity.user.media;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfileMediaStorageServiceTest {

    @TempDir
    Path uploadDir;

    @Test
    void storeAvatar_shouldReturnSameOriginApiPath() {
        ProfileMediaStorageService service = service();
        MockMultipartFile avatar = new MockMultipartFile(
                "avatar",
                "profile.png",
                "image/png",
                new byte[]{1, 2, 3}
        );

        String storedUrl = service.storeAvatar(avatar);

        assertTrue(storedUrl.matches("/api/users/media/avatar-[a-f0-9]{32}\\.png"));
        assertFalse(storedUrl.contains("localhost"));
        assertFalse(storedUrl.startsWith("http://"));
    }

    @Test
    void deleteByPublicUrl_shouldDeleteLegacyLocalhostAvatar() throws Exception {
        ProfileMediaStorageService service = service();
        Path avatar = uploadDir.resolve("avatar-legacy.png");
        Files.write(avatar, new byte[]{1, 2, 3});

        service.deleteByPublicUrl(
                "http://localhost:8080/api/users/media/avatar-legacy.png"
        );

        assertFalse(Files.exists(avatar));
    }

    @Test
    void deleteByPublicUrl_shouldIgnoreExternalProviderImage() throws Exception {
        ProfileMediaStorageService service = service();
        Path avatar = uploadDir.resolve("google-photo.png");
        Files.write(avatar, new byte[]{1, 2, 3});

        service.deleteByPublicUrl(
                "https://lh3.googleusercontent.com/google-photo.png"
        );

        assertTrue(Files.exists(avatar));
        assertEquals(3, Files.size(avatar));
    }

    private ProfileMediaStorageService service() {
        return new ProfileMediaStorageService(
                uploadDir.toString(),
                "http://localhost:8080/api/users/media",
                5 * 1024 * 1024
        );
    }
}
