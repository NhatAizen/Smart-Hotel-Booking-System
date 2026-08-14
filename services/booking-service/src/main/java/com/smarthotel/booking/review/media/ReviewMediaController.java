package com.smarthotel.booking.review.media;

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
@RequestMapping("/api/reviews/media")
public class ReviewMediaController {

    private final ReviewMediaStorageService storageService;

    public ReviewMediaController(ReviewMediaStorageService storageService) {
        this.storageService = storageService;
    }

    @GetMapping("/{filename:.+}")
    public ResponseEntity<Resource> get(@PathVariable String filename) {
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
