package com.smarthotel.booking.favorite.service;

import com.smarthotel.booking.favorite.dto.FavoriteHotelResponse;
import com.smarthotel.booking.favorite.dto.FavoriteStateResponse;
import com.smarthotel.booking.favorite.entity.CustomerHotelFavorite;
import com.smarthotel.booking.favorite.repository.CustomerHotelFavoriteRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class CustomerHotelFavoriteService {

    private final CustomerHotelFavoriteRepository favoriteRepository;
    private final HotelClient hotelClient;

    public CustomerHotelFavoriteService(
            CustomerHotelFavoriteRepository favoriteRepository,
            HotelClient hotelClient
    ) {
        this.favoriteRepository = favoriteRepository;
        this.hotelClient = hotelClient;
    }

    @Transactional(readOnly = true)
    public List<FavoriteHotelResponse> getMine(UUID customerId) {
        return favoriteRepository
                .findAllByCustomerIdOrderByCreatedAtDesc(customerId)
                .stream()
                .map(FavoriteHotelResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public FavoriteStateResponse getState(UUID customerId, UUID hotelId) {
        return new FavoriteStateResponse(
                hotelId,
                favoriteRepository.existsByCustomerIdAndHotelId(customerId, hotelId)
        );
    }

    @Transactional(readOnly = true)
    public long countMine(UUID customerId) {
        return favoriteRepository.countByCustomerId(customerId);
    }

    @Transactional
    public FavoriteHotelResponse add(UUID customerId, UUID hotelId) {
        CustomerHotelFavorite existing = favoriteRepository
                .findByCustomerIdAndHotelId(customerId, hotelId)
                .orElse(null);

        if (existing != null) {
            return FavoriteHotelResponse.from(existing);
        }

        // Xác minh khách sạn tồn tại và đang được Hotel Service công khai.
        hotelClient.getHotel(hotelId);

        CustomerHotelFavorite saved = favoriteRepository.save(
                new CustomerHotelFavorite(customerId, hotelId)
        );

        return FavoriteHotelResponse.from(saved);
    }

    @Transactional
    public void remove(UUID customerId, UUID hotelId) {
        if (favoriteRepository.existsByCustomerIdAndHotelId(customerId, hotelId)) {
            favoriteRepository.deleteByCustomerIdAndHotelId(customerId, hotelId);
        }
    }
}
