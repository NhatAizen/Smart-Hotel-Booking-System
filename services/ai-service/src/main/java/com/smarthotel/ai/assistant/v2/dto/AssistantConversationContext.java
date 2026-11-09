package com.smarthotel.ai.assistant.v2.dto;

import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;

/** Identifiers are references only: all room facts are reloaded and checked on the server. */
public record AssistantConversationContext(
        @Size(max = 8) List<UUID> roomTypeIds,
        @Size(max = 200) List<UUID> shownHotelIds,
        @Valid AssistantQueryContext lastHotelSearch,
        @Size(max = 30) String lastIntent,
        @Size(max = 200) List<UUID> shownRoomIds,
        @Valid AssistantQueryContext lastRoomSearch,
        UUID roomHotelId,
        @Size(max = 8) List<UUID> hotelIds,
        @Size(max = 8) List<UUID> recommendedHotelIds,
        @Valid AssistantRouteContext lastDirections) {
    public AssistantConversationContext(List<UUID> roomTypeIds,List<UUID> shownHotelIds,AssistantQueryContext lastHotelSearch,
            String lastIntent,List<UUID> shownRoomIds,AssistantQueryContext lastRoomSearch,UUID roomHotelId,
            List<UUID> hotelIds,List<UUID> recommendedHotelIds) {
        this(roomTypeIds,shownHotelIds,lastHotelSearch,lastIntent,shownRoomIds,lastRoomSearch,roomHotelId,hotelIds,recommendedHotelIds,null);
    }
    public AssistantConversationContext(List<UUID> roomTypeIds, List<UUID> shownHotelIds, AssistantQueryContext lastHotelSearch,
            String lastIntent, List<UUID> shownRoomIds, AssistantQueryContext lastRoomSearch, UUID roomHotelId, List<UUID> hotelIds) {
        this(roomTypeIds,shownHotelIds,lastHotelSearch,lastIntent,shownRoomIds,lastRoomSearch,roomHotelId,hotelIds,List.of());
    }
    public AssistantConversationContext(List<UUID> roomTypeIds, List<UUID> shownHotelIds,
                                        AssistantQueryContext lastHotelSearch, String lastIntent) {
        this(roomTypeIds, shownHotelIds, lastHotelSearch, lastIntent, List.of(), null, null, List.of());
    }
    public AssistantConversationContext(List<UUID> roomTypeIds) {
        this(roomTypeIds, List.of(), null, null);
    }
}
