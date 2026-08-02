package com.smarthotel.ai.assistant.service;

import com.smarthotel.ai.assistant.dto.AiTextResponse;
import com.smarthotel.ai.assistant.dto.ChatRequest;
import com.smarthotel.ai.assistant.dto.HotelCandidate;
import com.smarthotel.ai.assistant.dto.HotelRecommendationRequest;
import com.smarthotel.ai.assistant.dto.LiveHotelRecommendationRequest;
import com.smarthotel.ai.assistant.dto.ReviewSummaryRequest;
import com.smarthotel.ai.gemini.GeminiClient;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.HotelResponse;
import com.smarthotel.ai.integration.hotel.dto.HotelWithRoomTypes;
import com.smarthotel.ai.integration.hotel.dto.RoomTypeResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Service
public class AiAssistantService {

    private final GeminiClient geminiClient;
    private final HotelClient hotelClient;
    private final String model;

    public AiAssistantService(
            GeminiClient geminiClient,
            HotelClient hotelClient,
            @Value("${app.gemini.model}") String model
    ) {
        this.geminiClient = geminiClient;
        this.hotelClient = hotelClient;
        this.model = model;
    }

    public AiTextResponse chat(ChatRequest request) {
        String prompt = """
                You are the virtual assistant for Smart Hotel Booking System.

                Your responsibilities:
                - Help users choose hotels and rooms.
                - Explain booking, payment, cancellation, and check-in processes.
                - Do not invent hotel availability, prices, or policies.
                - Ask the user to verify information in the application when data is missing.
                - Answer in the same language as the user.
                - Keep the response clear and concise.

                User message:
                %s
                """.formatted(request.message().trim());

        return generate(prompt);
    }

    /*
     * Endpoint cũ:
     * Client tự gửi danh sách hotel candidates lên AI Service.
     */
    public AiTextResponse recommendHotels(
            HotelRecommendationRequest request
    ) {
        String hotelData = request.hotels()
                .stream()
                .map(this::formatHotelCandidate)
                .collect(Collectors.joining("\n"));

        String prompt = """
                You are a hotel recommendation assistant.

                Recommend only from the provided hotel candidates.
                Never invent another hotel.
                Consider the user's location, budget, star rating,
                and stated preferences.

                Return at most 3 recommendations.

                For every recommendation, include:
                - hotel ID
                - hotel name
                - short reason
                - price per night when available

                Answer in the same language as the user's requirement.

                User requirement:
                %s

                Hotel candidates:
                %s
                """.formatted(
                request.requirement().trim(),
                hotelData
        );

        return generate(prompt);
    }

    /*
     * Endpoint mới:
     * AI Service tự lấy hotel và room type thật từ Hotel Service.
     */
    public AiTextResponse recommendLiveHotels(
            LiveHotelRecommendationRequest request
    ) {
        List<HotelWithRoomTypes> hotels =
                hotelClient.getHotelsWithRoomTypes();

        if (hotels.isEmpty()) {
            return new AiTextResponse(
                    "Hiện hệ thống chưa có khách sạn đang hoạt động "
                            + "để tư vấn.",
                    model,
                    Instant.now()
            );
        }

        String hotelData = hotels.stream()
                .map(this::formatLiveHotel)
                .collect(Collectors.joining("\n"));

        String prompt = """
                You are the hotel recommendation assistant for
                Smart Hotel Booking System.

                IMPORTANT RULES:
                - Use only the real hotel and room-type data supplied below.
                - Never invent a hotel, room type, price, address,
                  star rating, capacity, or amenity.
                - If no candidate meets the user's requirement,
                  clearly say that no exact match was found.
                - You may suggest the closest alternatives only from
                  the supplied data.
                - Budget means price per room per night unless
                  the user explicitly says otherwise.
                - Return at most 3 hotels.
                - Prefer room types whose adult capacity satisfies
                  the requested number of guests.
                - Answer in the same language as the user.

                For every recommendation, show:
                - Hotel ID
                - Hotel name
                - City and address
                - Star rating
                - Suitable room type
                - Room-type ID
                - Price per night
                - Adult and child capacity
                - Short reason

                User requirement:
                %s

                REAL DATA FROM HOTEL SERVICE:
                %s
                """.formatted(
                request.requirement().trim(),
                hotelData
        );

        return generate(prompt);
    }

    public AiTextResponse summarizeReviews(
            ReviewSummaryRequest request
    ) {
        String reviewData = IntStream
                .range(0, request.reviews().size())
                .mapToObj(index ->
                        "%d. %s".formatted(
                                index + 1,
                                request.reviews()
                                        .get(index)
                                        .trim()
                        )
                )
                .collect(Collectors.joining("\n"));

        String prompt = """
                Summarize the following hotel reviews.

                Requirements:
                - Identify common positive points.
                - Identify common negative points.
                - Mention recurring complaints.
                - Give an overall neutral conclusion.
                - Do not invent facts.
                - Answer in the same language used by most reviews.
                - Use concise bullet points.

                Reviews:
                %s
                """.formatted(reviewData);

        return generate(prompt);
    }

    private AiTextResponse generate(String prompt) {
        return new AiTextResponse(
                geminiClient.generate(prompt),
                model,
                Instant.now()
        );
    }

    private String formatLiveHotel(
            HotelWithRoomTypes hotelData
    ) {
        HotelResponse hotel = hotelData.hotel();

        String roomTypes = hotelData.roomTypes().isEmpty()
                ? "No room types available"
                : hotelData.roomTypes()
                        .stream()
                        .map(this::formatRoomType)
                        .collect(Collectors.joining("\n"));

        return """
                ========================================
                Hotel ID: %s
                Hotel name: %s
                Description: %s
                City: %s
                Address: %s
                Star rating: %s
                Status: %s

                Room types:
                %s
                ========================================
                """.formatted(
                valueOrUnknown(hotel.id()),
                valueOrUnknown(hotel.name()),
                valueOrUnknown(hotel.description()),
                valueOrUnknown(hotel.city()),
                valueOrUnknown(hotel.address()),
                valueOrUnknown(hotel.starRating()),
                valueOrUnknown(hotel.status()),
                roomTypes
        );
    }

    private String formatRoomType(RoomTypeResponse roomType) {
        return """
                - Room-type ID: %s
                  Name: %s
                  Description: %s
                  Base price per night: %s
                  Maximum adults: %s
                  Maximum children: %s
                  Bed type: %s
                  Area square metres: %s
                """.formatted(
                valueOrUnknown(roomType.id()),
                valueOrUnknown(roomType.name()),
                valueOrUnknown(roomType.description()),
                valueOrUnknown(roomType.basePrice()),
                valueOrUnknown(roomType.maxAdults()),
                valueOrUnknown(roomType.maxChildren()),
                valueOrUnknown(roomType.bedType()),
                valueOrUnknown(roomType.areaSqm())
        );
    }

    private String formatHotelCandidate(HotelCandidate hotel) {
        return """
                Hotel ID: %s
                Name: %s
                City: %s
                Star rating: %s
                Price per night: %s
                Description: %s
                ---
                """.formatted(
                hotel.hotelId(),
                hotel.name(),
                hotel.city(),
                hotel.starRating() == null
                        ? "unknown"
                        : hotel.starRating(),
                hotel.pricePerNight() == null
                        ? "unknown"
                        : hotel.pricePerNight(),
                hotel.description() == null
                        ? ""
                        : hotel.description()
        );
    }

    private String valueOrUnknown(Object value) {
        if (value == null) {
            return "unknown";
        }

        String text = value.toString().trim();

        return text.isBlank()
                ? "unknown"
                : text;
    }
}