package com.smarthotel.ai.assistant.v2.dto;

import java.time.Instant;
import java.util.List;

public record AssistantResponse(
        String intent,
        String answer,
        AssistantQueryContext context,
        List<AssistantHotelCard> hotels,
        List<AssistantBookingCard> bookings,
        List<String> suggestedPrompts,
        String model,
        Instant generatedAt,
        AssistantEngine engine,
        List<AssistantRoomCard> rooms,
        String conversationAction,
        AssistantHotelComparison comparison,
        AssistantDirections directions
) {
    public AssistantResponse(String intent,String answer,AssistantQueryContext context,List<AssistantHotelCard> hotels,
            List<AssistantBookingCard> bookings,List<String> suggestedPrompts,String model,Instant generatedAt,
            AssistantEngine engine,List<AssistantRoomCard> rooms,String conversationAction,AssistantHotelComparison comparison) {
        this(intent,answer,context,hotels,bookings,suggestedPrompts,model,generatedAt,engine,rooms,conversationAction,comparison,null);
    }
    public AssistantResponse(String intent, String answer, AssistantQueryContext context, List<AssistantHotelCard> hotels,
            List<AssistantBookingCard> bookings, List<String> suggestedPrompts, String model, Instant generatedAt,
            AssistantEngine engine, List<AssistantRoomCard> rooms, String conversationAction) {
        this(intent,answer,context,hotels,bookings,suggestedPrompts,model,generatedAt,engine,rooms,conversationAction,null);
    }
    public AssistantResponse(String intent, String answer, AssistantQueryContext context, List<AssistantHotelCard> hotels,
            List<AssistantBookingCard> bookings, List<String> suggestedPrompts, String model, Instant generatedAt,
            AssistantEngine engine, List<AssistantRoomCard> rooms) {
        this(intent, answer, context, hotels, bookings, suggestedPrompts, model, generatedAt, engine, rooms, "NONE");
    }
    public AssistantResponse withEngine(AssistantEngine value) {
        return new AssistantResponse(intent, answer, context, hotels, bookings, suggestedPrompts, model, generatedAt, value, rooms, conversationAction,comparison,directions);
    }
    public AssistantResponse withAction(String value) {
        return new AssistantResponse(intent, answer, context, hotels, bookings, suggestedPrompts, model, generatedAt, engine, rooms, value,comparison,directions);
    }
    public AssistantResponse withComparison(AssistantHotelComparison value) {
        return new AssistantResponse(intent, answer, context, hotels, bookings, suggestedPrompts, model, generatedAt, engine, rooms, conversationAction,value,directions);
    }
    public AssistantResponse withDirections(AssistantDirections value) {
        return new AssistantResponse(intent,answer,context,hotels,bookings,suggestedPrompts,model,generatedAt,engine,rooms,conversationAction,comparison,value);
    }
}
