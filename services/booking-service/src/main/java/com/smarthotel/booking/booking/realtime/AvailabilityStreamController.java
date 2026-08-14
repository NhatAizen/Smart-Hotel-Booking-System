package com.smarthotel.booking.booking.realtime;

import io.swagger.v3.oas.annotations.Operation;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;

@RestController
@RequestMapping("/api/availability")
public class AvailabilityStreamController {

    private final AvailabilityRealtimeService realtimeService;

    public AvailabilityStreamController(AvailabilityRealtimeService realtimeService) {
        this.realtimeService = realtimeService;
    }

    @Operation(summary = "Theo dõi thay đổi tình trạng phòng theo thời gian thực")
    @GetMapping(
            value = "/stream/hotels/{hotelId}",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public SseEmitter stream(@PathVariable UUID hotelId) {
        return realtimeService.subscribe(hotelId);
    }
}
