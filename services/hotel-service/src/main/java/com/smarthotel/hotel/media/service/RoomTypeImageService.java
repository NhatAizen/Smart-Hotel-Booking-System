package com.smarthotel.hotel.media.service;

import com.smarthotel.hotel.media.dto.ImageResponse;
import com.smarthotel.hotel.media.entity.RoomTypeImage;
import com.smarthotel.hotel.media.repository.RoomTypeImageRepository;
import com.smarthotel.hotel.roomtype.service.RoomTypeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class RoomTypeImageService {

    private final RoomTypeImageRepository repository;
    private final RoomTypeService roomTypeService;
    private final MediaStorageService storageService;

    public RoomTypeImageService(
            RoomTypeImageRepository repository,
            RoomTypeService roomTypeService,
            MediaStorageService storageService
    ) {
        this.repository = repository;
        this.roomTypeService = roomTypeService;
        this.storageService = storageService;
    }

    @Transactional
    public List<ImageResponse> upload(
            UUID ownerId,
            UUID roomTypeId,
            List<MultipartFile> files
    ) {
        roomTypeService.getOwnedRoomType(ownerId, roomTypeId);

        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("Vui lòng chọn ít nhất một ảnh");
        }

        List<RoomTypeImage> existing =
                repository.findAllByRoomTypeIdOrderBySortOrderAscCreatedAtAsc(roomTypeId);

        boolean hasCover = existing.stream().anyMatch(RoomTypeImage::isCover);
        int sortOrder = existing.size();
        List<ImageResponse> responses = new ArrayList<>();

        for (MultipartFile file : files) {
            MediaStorageService.StoredFile stored =
                    storageService.store(file, "room-type");

            RoomTypeImage image = repository.save(
                    new RoomTypeImage(
                            roomTypeId,
                            stored.fileName(),
                            stored.originalName(),
                            stored.contentType(),
                            stored.fileSize(),
                            !hasCover,
                            sortOrder++
                    )
            );

            hasCover = true;
            responses.add(toResponse(image));
        }

        return responses;
    }

    @Transactional
    public ImageResponse setCover(
            UUID ownerId,
            UUID roomTypeId,
            UUID imageId
    ) {
        roomTypeService.getOwnedRoomType(ownerId, roomTypeId);

        List<RoomTypeImage> images =
                repository.findAllByRoomTypeIdOrderBySortOrderAscCreatedAtAsc(roomTypeId);

        RoomTypeImage selected = images.stream()
                .filter(image -> image.getId().equals(imageId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy ảnh"));

        images.forEach(image -> image.markCover(image.getId().equals(imageId)));

        return toResponse(selected);
    }

    @Transactional
    public void delete(
            UUID ownerId,
            UUID roomTypeId,
            UUID imageId
    ) {
        roomTypeService.getOwnedRoomType(ownerId, roomTypeId);

        RoomTypeImage image = repository
                .findByIdAndRoomTypeId(imageId, roomTypeId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy ảnh"));

        boolean wasCover = image.isCover();
        repository.delete(image);
        storageService.delete(image.getFileName());

        if (wasCover) {
            repository.findAllByRoomTypeIdOrderBySortOrderAscCreatedAtAsc(roomTypeId)
                    .stream()
                    .findFirst()
                    .ifPresent(next -> next.markCover(true));
        }
    }

    private ImageResponse toResponse(RoomTypeImage image) {
        return ImageResponse.from(
                image,
                storageService.publicUrl(image.getFileName())
        );
    }
}
