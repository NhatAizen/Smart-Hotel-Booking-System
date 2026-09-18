package com.smarthotel.hotel.policy.service;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.policy.dto.HotelPolicyRuleRequest;
import com.smarthotel.hotel.policy.dto.HotelPolicyResponse;
import com.smarthotel.hotel.policy.dto.UpdateHotelPolicyRequest;
import com.smarthotel.hotel.policy.repository.HotelPolicyRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HotelPolicyServiceTest {

    @Mock
    private HotelPolicyRepository policyRepository;

    @Mock
    private HotelService hotelService;

    @Test
    void ownerCanPersistRulesForTheSelectedHotel() {
        UUID ownerId = UUID.randomUUID();
        Hotel hotel = hotel(ownerId);
        when(hotelService.getOwnedHotel(hotel.getId(), ownerId)).thenReturn(hotel);
        when(policyRepository.findById(hotel.getId())).thenReturn(java.util.Optional.empty());
        when(policyRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        HotelPolicyService service = new HotelPolicyService(policyRepository, hotelService);
        HotelPolicyResponse response = service.updateOwned(
                ownerId,
                hotel.getId(),
                new UpdateHotelPolicyRequest(
                        LocalTime.of(14, 0), LocalTime.of(12, 0), true,
                        "Liên hệ lễ tân", "Theo sức chứa phòng", true, false,
                        false, false, false, LocalTime.of(22, 0),
                        LocalTime.of(6, 0), true, "Xuất trình mã booking",
                        List.of(new HotelPolicyRuleRequest("Giữ yên tĩnh", "Không gây ồn"))
                )
        );

        assertEquals(hotel.getId(), response.hotelId());
        assertEquals(LocalTime.of(14, 0), response.checkInTime());
        assertEquals(1, response.additionalRules().size());
        verify(policyRepository).save(any());
    }

    @Test
    void nonOwnerCannotReachPolicyPersistence() {
        UUID nonOwnerId = UUID.randomUUID();
        UUID hotelId = UUID.randomUUID();
        when(hotelService.getOwnedHotel(hotelId, nonOwnerId))
                .thenThrow(new AccessDeniedException("Bạn không có quyền quản lý khách sạn này"));

        HotelPolicyService service = new HotelPolicyService(policyRepository, hotelService);
        UpdateHotelPolicyRequest request = new UpdateHotelPolicyRequest(
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, List.of()
        );

        assertThrows(
                AccessDeniedException.class,
                () -> service.updateOwned(nonOwnerId, hotelId, request)
        );
        verify(policyRepository, never()).save(any());
    }

    private Hotel hotel(UUID ownerId) {
        return new Hotel(
                ownerId, "Hotel A", null, "1 Đường A", null, null,
                "Hà Nội", null, null, null, null, 4,
                null, null, Set.of()
        );
    }
}
