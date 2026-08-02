package com.smarthotel.ai.assistant.controller;

import com.smarthotel.ai.assistant.dto.AiTextResponse;
import com.smarthotel.ai.assistant.dto.ChatRequest;
import com.smarthotel.ai.assistant.dto.HotelRecommendationRequest;
import com.smarthotel.ai.assistant.dto.LiveHotelRecommendationRequest;
import com.smarthotel.ai.assistant.dto.ReviewSummaryRequest;
import com.smarthotel.ai.assistant.service.AiAssistantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
@Tag(
        name = "AI Assistant",
        description = "Chat, hotel recommendations, and review summaries"
)
public class AiAssistantController {

    private final AiAssistantService aiAssistantService;

    public AiAssistantController(
            AiAssistantService aiAssistantService
    ) {
        this.aiAssistantService = aiAssistantService;
    }

    @Operation(summary = "Chat with the hotel assistant")
    @PostMapping("/chat")
    public ResponseEntity<AiTextResponse> chat(
            @Valid @RequestBody ChatRequest request
    ) {
        return ResponseEntity.ok(
                aiAssistantService.chat(request)
        );
    }

    @Operation(
            summary = "Recommend hotels from candidates supplied by client"
    )
    @PostMapping("/recommend-hotels")
    public ResponseEntity<AiTextResponse> recommendHotels(
            @Valid @RequestBody HotelRecommendationRequest request
    ) {
        return ResponseEntity.ok(
                aiAssistantService.recommendHotels(request)
        );
    }

    @Operation(
            summary = "Recommend hotels using real Hotel Service data"
    )
    @PostMapping("/recommend-hotels/live")
    public ResponseEntity<AiTextResponse> recommendLiveHotels(
            @Valid @RequestBody LiveHotelRecommendationRequest request
    ) {
        return ResponseEntity.ok(
                aiAssistantService.recommendLiveHotels(request)
        );
    }

    @Operation(summary = "Summarize hotel reviews")
    @PostMapping("/summarize-reviews")
    public ResponseEntity<AiTextResponse> summarizeReviews(
            @Valid @RequestBody ReviewSummaryRequest request
    ) {
        return ResponseEntity.ok(
                aiAssistantService.summarizeReviews(request)
        );
    }
}