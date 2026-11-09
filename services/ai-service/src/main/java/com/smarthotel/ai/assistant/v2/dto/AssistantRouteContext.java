package com.smarthotel.ai.assistant.v2.dto;

import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** References only; map coordinates and URLs are never accepted from conversation memory. */
public record AssistantRouteContext(@Size(max=160) String originQuery,
        @Size(max=8) List<UUID> destinationIds, boolean originResolved, boolean hotelChoiceRequired, boolean hotelAtOrigin, boolean coordinatesOnly) {
    public AssistantRouteContext(String originQuery,List<UUID> destinationIds,boolean originResolved,boolean hotelChoiceRequired,boolean hotelAtOrigin) {
        this(originQuery,destinationIds,originResolved,hotelChoiceRequired,hotelAtOrigin,false);
    }
    public AssistantRouteContext(String originQuery,List<UUID> destinationIds,boolean originResolved,boolean hotelChoiceRequired) {
        this(originQuery,destinationIds,originResolved,hotelChoiceRequired,false);
    }
}
