package com.smarthotel.hotel.media.service;

import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.media.dto.ImageResponse;
import com.smarthotel.hotel.media.entity.HotelImage;
import com.smarthotel.hotel.media.repository.HotelImageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class HotelImageService {

    private final HotelImageRepository repository;
    private final HotelService hotelService;
    private final MediaStorageService storageService;

    public HotelImageService(
            HotelImageRepository repository,
            HotelService hotelService,
            MediaStorageService storageService
    ) {
        this.repository = repository;
        this.hotelService = hotelService;
        this.storageService = storageService;
    }

    @Transactional
    public List<ImageResponse> upload(
            UUID ownerId,
            UUID hotelId,
            List<MultipartFile> files
    ) {
        hotelService.getOwnedHotel(hotelId, ownerId);

        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("Vui lòng chọn ít nhất một ảnh");
        }

        List<HotelImage> existing =
                repository.findAllByHotelIdOrderBySortOrderAscCreatedAtAsc(hotelId);

        boolean hasCover = existing.stream().anyMatch(HotelImage::isCover);
        int sortOrder = existing.size();
        List<ImageResponse> responses = new ArrayList<>();

        for (MultipartFile file : files) {
            MediaStorageService.StoredFile stored =
                    storageService.store(file, "hotel");

            HotelImage image = repository.save(
                    new HotelImage(
                            hotelId,
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
            UUID hotelId,
            UUID imageId
    ) {
        hotelService.getOwnedHotel(hotelId, ownerId);

        List<HotelImage> images =
                repository.findAllByHotelIdOrderBySortOrderAscCreatedAtAsc(hotelId);

        HotelImage selected = images.stream()
                .filter(image -> image.getId().equals(imageId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy ảnh"));

        images.forEach(image -> image.markCover(image.getId().equals(imageId)));

        return toResponse(selected);
    }

    @Transactional
    public void delete(
            UUID ownerId,
            UUID hotelId,
            UUID imageId
    ) {
        hotelService.getOwnedHotel(hotelId, ownerId);

        HotelImage image = repository
                .findByIdAndHotelId(imageId, hotelId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy ảnh"));

        boolean wasCover = image.isCover();
        repository.delete(image);
        storageService.delete(image.getFileName());

        if (wasCover) {
            repository.findAllByHotelIdOrderBySortOrderAscCreatedAtAsc(hotelId)
                    .stream()
                    .findFirst()
                    .ifPresent(next -> next.markCover(true));
        }
    }

    private ImageResponse toResponse(HotelImage image) {
        return ImageResponse.from(
                image,
                storageService.publicUrl(image.getFileName())
        );
    }
}
