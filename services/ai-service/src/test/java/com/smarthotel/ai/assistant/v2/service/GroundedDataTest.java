package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.integration.booking.dto.*;
import com.smarthotel.ai.integration.hotel.dto.RoomResponse;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClientException;
import static org.assertj.core.api.Assertions.*;

class GroundedDataTest {
    private final UUID hotel=UUID.randomUUID();
    private final LocalDate start=LocalDate.of(2026,11,1), end=start.plusDays(2);
    @Test
    void availabilityMustMatchBothHotelAndDatesBeforeClaimingAnyRoomIsFree() {
        for(var result:List.of(
            new AvailabilityResponse(UUID.randomUUID(),start,end,List.of()),
            new AvailabilityResponse(hotel,start.plusDays(1),end,List.of()),
            new AvailabilityResponse(hotel,start,end.plusDays(1),List.of()),
            new AvailabilityResponse(hotel,start,end,null),
            new AvailabilityResponse(hotel,start,end,Arrays.asList((UUID)null))))
            assertThatThrownBy(()->GroundedData.availability(hotel,start,end,result)).isInstanceOf(RestClientException.class);
        assertThat(GroundedData.availability(hotel,start,end,new AvailabilityResponse(hotel,start,end,List.of())).unavailableRoomIds()).isEmpty();
    }
    @Test
    void aReviewRatingRequiresValidEvidenceForThatHotel() {
        for(var result:List.of(new ReviewSummaryResponse(UUID.randomUUID(),1,8.0,Map.of(),Map.of()),
            new ReviewSummaryResponse(hotel,0,9.0,Map.of(),Map.of()),
            new ReviewSummaryResponse(hotel,1,Double.NaN,Map.of(),Map.of()),
            new ReviewSummaryResponse(hotel,1,11.0,Map.of(),Map.of())))
            assertThatThrownBy(()->GroundedData.reviews(hotel,result)).isInstanceOf(RestClientException.class);
        assertThat(GroundedData.reviews(hotel,new ReviewSummaryResponse(hotel,0,null,Map.of(),Map.of())).reviewCount()).isZero();
    }
    @Test
    void foreignOrUnknownRoomInventoryCannotBeCountedAsAvailable() {
        for(var room:List.of(new RoomResponse(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"101",1,"AVAILABLE",null,null),
            new RoomResponse(UUID.randomUUID(),hotel,UUID.randomUUID(),"101",1,"UNKNOWN",null,null)))
            assertThatThrownBy(()->GroundedData.inventory(hotel,List.of(room))).isInstanceOf(RestClientException.class);
        assertThat(GroundedData.inventory(hotel,List.of())).isEmpty();
    }
}
