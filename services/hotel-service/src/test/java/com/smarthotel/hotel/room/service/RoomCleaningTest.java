package com.smarthotel.hotel.room.service;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.integration.notification.NotificationClient;
import com.smarthotel.hotel.room.entity.Room;
import com.smarthotel.hotel.room.entity.RoomStatus;
import com.smarthotel.hotel.room.repository.RoomRepository;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

@ExtendWith(MockitoExtension.class)
class RoomCleaningTest {
    @Mock HotelService hotelService;
    @Mock RoomTypeRepository roomTypeRepository;
    @Mock RoomRepository roomRepository;
    @Mock NotificationClient notificationClient;
    @InjectMocks RoomService service;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID hotelId = UUID.randomUUID();
    private final Room room = new Room(hotelId, UUID.randomUUID(), "101", 1, null, null);

    @Test
    void completesCleaningForOwnerAndMakesRoomAvailable() {
        room.update(room.getRoomTypeId(), room.getRoomNumber(), room.getFloor(),
                RoomStatus.CLEANING, null, null);
        Hotel hotel = org.mockito.Mockito.mock(Hotel.class);
        when(roomRepository.findById(room.getId())).thenReturn(Optional.of(room));
        when(hotelService.getOwnedHotel(hotelId, ownerId)).thenReturn(hotel);

        var result = service.completeCleaning(ownerId, room.getId());

        assertThat(result.status()).isEqualTo(RoomStatus.AVAILABLE);
        verify(notificationClient).sendRoomReady(ownerId, "101", hotel.getName());
    }

    @Test
    void rejectsCompletionWhenRoomIsNotCleaning() {
        when(roomRepository.findById(room.getId())).thenReturn(Optional.of(room));
        when(hotelService.getOwnedHotel(hotelId, ownerId))
                .thenReturn(org.mockito.Mockito.mock(Hotel.class));

        assertThatThrownBy(() -> service.completeCleaning(ownerId, room.getId()))
                .isInstanceOf(IllegalArgumentException.class);
        verify(notificationClient, never()).sendRoomReady(any(), any(), any());
    }

    @Test
    void rejectsOtherOwnerBeforeChangingCleaningStatus() {
        room.update(room.getRoomTypeId(), room.getRoomNumber(), room.getFloor(),
                RoomStatus.CLEANING, null, null);
        when(roomRepository.findById(room.getId())).thenReturn(Optional.of(room));
        when(hotelService.getOwnedHotel(hotelId, ownerId))
                .thenThrow(new AccessDeniedException("Forbidden"));

        assertThatThrownBy(() -> service.completeCleaning(ownerId, room.getId()))
                .isInstanceOf(AccessDeniedException.class);
        assertThat(room.getStatus()).isEqualTo(RoomStatus.CLEANING);
        verify(notificationClient, never()).sendRoomReady(any(), any(), any());
    }
}
