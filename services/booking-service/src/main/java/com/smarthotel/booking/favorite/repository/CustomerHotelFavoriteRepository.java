package com.smarthotel.booking.favorite.repository;

import com.smarthotel.booking.favorite.entity.CustomerHotelFavorite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CustomerHotelFavoriteRepository
        extends JpaRepository<CustomerHotelFavorite, UUID> {

    List<CustomerHotelFavorite> findAllByCustomerIdOrderByCreatedAtDesc(UUID customerId);

    Optional<CustomerHotelFavorite> findByCustomerIdAndHotelId(
            UUID customerId,
            UUID hotelId
    );

    boolean existsByCustomerIdAndHotelId(UUID customerId, UUID hotelId);

    long countByCustomerId(UUID customerId);

    void deleteByCustomerIdAndHotelId(UUID customerId, UUID hotelId);
}
