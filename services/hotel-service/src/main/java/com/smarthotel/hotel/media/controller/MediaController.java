package com.smarthotel.hotel.media.controller;

import com.smarthotel.hotel.media.dto.ImageResponse;
import com.smarthotel.hotel.media.service.HotelImageService;
import com.smarthotel.hotel.media.service.MediaStorageService;
import com.smarthotel.hotel.media.service.RoomTypeImageService;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api")
public class MediaController {

    private final HotelImageService hotelImageService;
    private final RoomTypeImageService roomTypeImageService;
    private final MediaStorageService storageService;

    public MediaController(
            HotelImageService hotelImageService,
            RoomTypeImageService roomTypeImageService,
            MediaStorageService storageService
    ) {
        this.hotelImageService = hotelImageService;
        this.roomTypeImageService = roomTypeImageService;
        this.storageService = storageService;
    }

    @PostMapping(
            value = "/hotels/{hotelId}/images",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<List<ImageResponse>> uploadHotelImages(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @RequestPart("files") List<MultipartFile> files
    ) {
        return ResponseEntity.ok(
                hotelImageService.upload(currentUserId(jwt), hotelId, files)
        );
    }

    @PatchMapping("/hotels/{hotelId}/images/{imageId}/cover")
    public ResponseEntity<ImageResponse> setHotelCover(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @PathVariable UUID imageId
    ) {
        return ResponseEntity.ok(
                hotelImageService.setCover(currentUserId(jwt), hotelId, imageId)
        );
    }

    @DeleteMapping("/hotels/{hotelId}/images/{imageId}")
    public ResponseEntity<Void> deleteHotelImage(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @PathVariable UUID imageId
    ) {
        hotelImageService.delete(currentUserId(jwt), hotelId, imageId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(
            value = "/room-types/{roomTypeId}/images",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<List<ImageResponse>> uploadRoomTypeImages(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomTypeId,
            @RequestPart("files") List<MultipartFile> files
    ) {
        return ResponseEntity.ok(
                roomTypeImageService.upload(currentUserId(jwt), roomTypeId, files)
        );
    }

    @PatchMapping("/room-types/{roomTypeId}/images/{imageId}/cover")
    public ResponseEntity<ImageResponse> setRoomTypeCover(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomTypeId,
            @PathVariable UUID imageId
    ) {
        return ResponseEntity.ok(
                roomTypeImageService.setCover(currentUserId(jwt), roomTypeId, imageId)
        );
    }

    @DeleteMapping("/room-types/{roomTypeId}/images/{imageId}")
    public ResponseEntity<Void> deleteRoomTypeImage(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomTypeId,
            @PathVariable UUID imageId
    ) {
        roomTypeImageService.delete(currentUserId(jwt), roomTypeId, imageId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/hotels/media/{fileName:.+}")
    public ResponseEntity<Resource> read(@PathVariable String fileName) {
        Resource resource = storageService.load(fileName);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic())
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"" + resource.getFilename() + "\""
                )
                .contentType(resolveMediaType(fileName))
                .body(resource);
    }

    private MediaType resolveMediaType(String fileName) {
        String lower = fileName.toLowerCase();

        if (lower.endsWith(".png")) {
            return MediaType.IMAGE_PNG;
        }
        if (lower.endsWith(".gif")) {
            return MediaType.IMAGE_GIF;
        }
        if (lower.endsWith(".webp")) {
            return MediaType.parseMediaType("image/webp");
        }
        return MediaType.IMAGE_JPEG;
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
