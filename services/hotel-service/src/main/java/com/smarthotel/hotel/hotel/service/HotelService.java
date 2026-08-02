package com.smarthotel.hotel.hotel.service;

import com.smarthotel.hotel.common.exception.HotelNotFoundException;
import com.smarthotel.hotel.hotel.dto.CreateHotelRequest;
import com.smarthotel.hotel.hotel.dto.HotelResponse;
import com.smarthotel.hotel.hotel.dto.UpdateHotelRequest;
import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.entity.HotelStatus;
import com.smarthotel.hotel.hotel.repository.HotelRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class HotelService {

    private final HotelRepository hotelRepository;

    public HotelService(HotelRepository hotelRepository) {
        this.hotelRepository = hotelRepository;
    }

    @Transactional
    public HotelResponse create(CreateHotelRequest request) {
        Hotel hotel = new Hotel(
                request.ownerId(),
                normalize(request.name()),
                normalizeNullable(request.description()),
                normalize(request.address()),
                normalize(request.city()),
                normalizeNullable(request.phone()),
                normalizeNullable(request.email()),
                request.starRating()
        );

        return HotelResponse.from(
                hotelRepository.save(hotel)
        );
    }

    @Transactional(readOnly = true)
    public HotelResponse getById(UUID hotelId) {
        return HotelResponse.from(
                findHotel(hotelId)
        );
    }

    @Transactional(readOnly = true)
    public List<HotelResponse> getAll(
            String city,
            HotelStatus status
    ) {
        HotelStatus effectiveStatus =
                status == null ? HotelStatus.ACTIVE : status;

        List<Hotel> hotels;

        if (city != null && !city.isBlank()) {
            hotels =
                    hotelRepository
                            .findAllByCityIgnoreCaseAndStatusOrderByCreatedAtDesc(
                                    city.trim(),
                                    effectiveStatus
                            );
        } else {
            hotels =
                    hotelRepository
                            .findAllByStatusOrderByCreatedAtDesc(
                                    effectiveStatus
                            );
        }

        return hotels.stream()
                .map(HotelResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<HotelResponse> getByOwner(UUID ownerId) {
        return hotelRepository
                .findAllByOwnerIdOrderByCreatedAtDesc(ownerId)
                .stream()
                .map(HotelResponse::from)
                .toList();
    }

    @Transactional
    public HotelResponse update(
            UUID hotelId,
            UpdateHotelRequest request
    ) {
        Hotel hotel = findHotel(hotelId);

        hotel.update(
                normalize(request.name()),
                normalizeNullable(request.description()),
                normalize(request.address()),
                normalize(request.city()),
                normalizeNullable(request.phone()),
                normalizeNullable(request.email()),
                request.starRating(),
                request.status()
        );

        return HotelResponse.from(hotel);
    }

    @Transactional
    public void delete(UUID hotelId) {
        Hotel hotel = findHotel(hotelId);

        // Soft delete để không làm mất dữ liệu liên quan.
        hotel.deactivate();
    }

    private Hotel findHotel(UUID hotelId) {
        return hotelRepository
                .findById(hotelId)
                .orElseThrow(
                        () -> new HotelNotFoundException(hotelId)
                );
    }

    private String normalize(String value) {
        return value.trim();
    }

    private String normalizeNullable(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}