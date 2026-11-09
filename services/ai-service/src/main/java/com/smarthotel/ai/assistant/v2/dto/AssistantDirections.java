package com.smarthotel.ai.assistant.v2.dto;

import java.util.List;
import java.util.UUID;

public record AssistantDirections(NearbyLocation origin, List<Destination> destinations,
        boolean hotelChoiceRequired, boolean originRequired, boolean hotelAtOrigin, boolean coordinatesOnly) {
    public AssistantDirections(NearbyLocation origin,List<Destination> destinations,boolean hotelChoiceRequired,boolean originRequired,boolean hotelAtOrigin) {
        this(origin,destinations,hotelChoiceRequired,originRequired,hotelAtOrigin,false);
    }
    public AssistantDirections(NearbyLocation origin,List<Destination> destinations,boolean hotelChoiceRequired,boolean originRequired) {
        this(origin,destinations,hotelChoiceRequired,originRequired,false);
    }
    /** Shared landmark endpoint; origin is retained for older clients. */
    @com.fasterxml.jackson.annotation.JsonProperty("landmark")
    public NearbyLocation landmark() {return origin;}
    public record Destination(UUID hotelId, String name, String address, String mapsUrl) {}
}
