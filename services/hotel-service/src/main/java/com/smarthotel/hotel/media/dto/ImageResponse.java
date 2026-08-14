package com.smarthotel.hotel.media.dto;

import com.smarthotel.hotel.media.entity.HotelImage;
import com.smarthotel.hotel.media.entity.RoomTypeImage;

import java.time.Instant;
import java.util.UUID;

public record ImageResponse(
        UUID id,
        String url,
        String originalName,
        String contentType,
        long fileSize,
        boolean cover,
        int sortOrder,
        Instant createdAt
) {
    public static ImageResponse from(HotelImage image, String url) {
        return new ImageResponse(
                image.getId(),
                url,
                image.getOriginalName(),
                image.getContentType(),
                image.getFileSize(),
                image.isCover(),
                image.getSortOrder(),
                image.getCreatedAt()
        );
    }

    public static ImageResponse from(RoomTypeImage image, String url) {
        return new ImageResponse(
                image.getId(),
                url,
                image.getOriginalName(),
                image.getContentType(),
                image.getFileSize(),
                image.isCover(),
                image.getSortOrder(),
                image.getCreatedAt()
        );
    }
}
