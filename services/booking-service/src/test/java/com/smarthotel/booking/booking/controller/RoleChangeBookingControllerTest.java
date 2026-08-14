package com.smarthotel.booking.booking.controller;

import com.smarthotel.booking.booking.dto.RoleChangeBookingEligibilityRequest;
import com.smarthotel.booking.booking.dto.RoleChangeBookingEligibilityResponse;
import com.smarthotel.booking.booking.service.BookingService;
import com.smarthotel.booking.integration.hotel.RoleChangeHotelClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RoleChangeBookingControllerTest {

    @Mock BookingService bookingService;
    @Mock RoleChangeHotelClient hotelClient;

    @Test
    void rejectsHotelIdsThatDoNotExactlyMatchOwnersPortfolio() {
        UUID ownerId = UUID.randomUUID();
        UUID ownedHotelId = UUID.randomUUID();
        UUID suppliedForeignHotelId = UUID.randomUUID();
        RoleChangeBookingController controller = controller();
        Jwt jwt = jwt(ownerId, "HOTEL_ADMIN");

        when(hotelClient.getOwnerHotelPortfolio(ownerId, jwt.getTokenValue()))
                .thenReturn(new RoleChangeHotelClient.OwnerHotelPortfolio(
                        List.of(ownedHotelId),
                        1,
                        1
                ));

        assertThatThrownBy(() -> controller.getBookingEligibility(
                jwt,
                new RoleChangeBookingEligibilityRequest(
                        ownerId,
                        List.of(suppliedForeignHotelId)
                )
        )).isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(bookingService);
    }

    @Test
    void systemAdminCanInspectOnlyVerifiedOwnerPortfolio() {
        UUID systemAdminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID hotelId = UUID.randomUUID();
        RoleChangeBookingController controller = controller();
        Jwt jwt = jwt(systemAdminId, "SYSTEM_ADMIN");
        RoleChangeBookingEligibilityRequest request =
                new RoleChangeBookingEligibilityRequest(ownerId, List.of(hotelId));
        RoleChangeBookingEligibilityResponse expected =
                new RoleChangeBookingEligibilityResponse(true, 0, 0, List.of());

        when(hotelClient.getOwnerHotelPortfolio(ownerId, jwt.getTokenValue()))
                .thenReturn(new RoleChangeHotelClient.OwnerHotelPortfolio(
                        List.of(hotelId),
                        1,
                        1
                ));
        when(bookingService.getRoleChangeEligibility(request)).thenReturn(expected);

        assertThat(controller.getBookingEligibility(jwt, request).getBody())
                .isEqualTo(expected);
    }

    private RoleChangeBookingController controller() {
        return new RoleChangeBookingController(bookingService, hotelClient);
    }

    private Jwt jwt(UUID userId, String role) {
        return Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .subject(userId.toString())
                .claim("role", role)
                .build();
    }
}
