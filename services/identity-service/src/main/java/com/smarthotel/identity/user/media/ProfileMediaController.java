package com.smarthotel.identity.user.media;

import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/users/media")
public class ProfileMediaController {

    private final ProfileMediaStorageService storageService;

    public ProfileMediaController(ProfileMediaStorageService storageService) {
        this.storageService = storageService;
    }

    @GetMapping("/{filename:.+}")
    public ResponseEntity<Resource> getAvatar(@PathVariable String filename) {
        Resource resource = storageService.load(filename);
        MediaType mediaType = MediaType.parseMediaType(
                storageService.contentType(filename)
        );

        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic())
                .body(resource);
    }
}
