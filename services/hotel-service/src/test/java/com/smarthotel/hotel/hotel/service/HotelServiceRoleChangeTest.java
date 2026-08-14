package com.smarthotel.hotel.hotel.service;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.entity.HotelStatus;
import com.smarthotel.hotel.hotel.repository.HotelRepository;
import com.smarthotel.hotel.integration.geocoding.NominatimGeocodingClient;
import com.smarthotel.hotel.integration.notification.NotificationClient;
import com.smarthotel.hotel.media.repository.HotelImageRepository;
import com.smarthotel.hotel.media.service.MediaStorageService;
import com.smarthotel.hotel.room.repository.RoomRepository;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import com.smarthotel.hotel.rolechange.fence.OwnerDemotionFenceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HotelServiceRoleChangeTest {

    @Mock HotelRepository hotelRepository;
    @Mock HotelImageRepository hotelImageRepository;
    @Mock RoomTypeRepository roomTypeRepository;
    @Mock RoomRepository roomRepository;
    @Mock MediaStorageService mediaStorageService;
    @Mock NotificationClient notificationClient;
    @Mock NominatimGeocodingClient geocodingClient;
    @Mock OwnerDemotionFenceService ownerDemotionFenceService;

    @InjectMocks HotelService hotelService;

    @Test
    void portfolioIncludesInactiveHotelsAndDeactivateIsIdempotent() {
        UUID ownerId = UUID.randomUUID();
        Hotel active = hotel(ownerId, "Enziu One");
        Hotel inactive = hotel(ownerId, "Enziu Two");
        inactive.deactivate();

        when(hotelRepository.findAllByOwnerIdOrderByCreatedAtDesc(ownerId))
                .thenReturn(List.of(active, inactive));

        var portfolio = hotelService.getOwnerPortfolio(ownerId);
        assertThat(portfolio.hotelIds()).containsExactly(active.getId(), inactive.getId());
        assertThat(portfolio.totalHotels()).isEqualTo(2);
        assertThat(portfolio.activeHotels()).isEqualTo(1);

        assertThat(hotelService.deactivateOwnerHotels(ownerId).deactivatedHotels())
                .isEqualTo(1);
        assertThat(active.getStatus()).isEqualTo(HotelStatus.INACTIVE);
        assertThat(inactive.getStatus()).isEqualTo(HotelStatus.INACTIVE);

        assertThat(hotelService.deactivateOwnerHotels(ownerId).deactivatedHotels())
                .isZero();
    }

    private Hotel hotel(UUID ownerId, String name) {
        return new Hotel(
                ownerId,
                name,
                null,
                "1 Enziu Street",
                null,
                null,
                "Da Nang",
                null,
                null,
                null,
                null,
                3,
                null,
                null,
                Set.of()
        );
    }
}
