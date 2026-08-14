package com.smarthotel.hotel.media.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "room_type_images")
public class RoomTypeImage {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "room_type_id", nullable = false)
    private UUID roomTypeId;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "original_name", length = 255)
    private String originalName;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(name = "is_cover", nullable = false)
    private boolean cover;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected RoomTypeImage() {
    }

    public RoomTypeImage(
            UUID roomTypeId,
            String fileName,
            String originalName,
            String contentType,
            long fileSize,
            boolean cover,
            int sortOrder
    ) {
        this.id = UUID.randomUUID();
        this.roomTypeId = roomTypeId;
        this.fileName = fileName;
        this.originalName = originalName;
        this.contentType = contentType;
        this.fileSize = fileSize;
        this.cover = cover;
        this.sortOrder = sortOrder;
        this.createdAt = Instant.now();
    }

    public void markCover(boolean cover) {
        this.cover = cover;
    }

    public UUID getId() { return id; }
    public UUID getRoomTypeId() { return roomTypeId; }
    public String getFileName() { return fileName; }
    public String getOriginalName() { return originalName; }
    public String getContentType() { return contentType; }
    public long getFileSize() { return fileSize; }
    public boolean isCover() { return cover; }
    public int getSortOrder() { return sortOrder; }
    public Instant getCreatedAt() { return createdAt; }
}
