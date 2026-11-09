package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.SemanticDecision;
import com.smarthotel.ai.assistant.v2.dto.AssistantRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.LinkedHashMap;
import java.util.List;

@Component
public class LocalSemanticClient {
    private static final Set<String> INTENTS = Set.of("ROOM_RECOMMEND", "ROOM_COMPARE", "RECOMMEND_HOTELS",
            "COMPARE_HOTELS", "HOTEL_DETAILS", "DIRECTIONS", "REVIEW_SUMMARY", "MY_BOOKINGS", "GENERAL", "OUT_OF_SCOPE", "CLARIFY");
    private final boolean enabled;
    private final RestClient client;
    private final ObjectMapper json = new ObjectMapper();

    public LocalSemanticClient(@Value("${app.semantic.enabled:false}") boolean enabled,
                               @Value("${app.semantic.base-url:http://semantic-service:8091}") String baseUrl) {
        // Never accept a public inference-provider URL through this configuration.
        String host = URI.create(baseUrl).getHost();
        if (!Set.of("semantic-service", "localhost", "127.0.0.1").contains(host)) {
            throw new IllegalArgumentException("Semantic service must be hosted internally");
        }
        this.enabled = enabled;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(600));
        factory.setReadTimeout(Duration.ofSeconds(45));
        this.client = RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }

    public Optional<SemanticDecision> classify(String message, boolean hotelContext) {
        return classifyPayload(Map.of("message", message, "hotelContext", hotelContext));
    }

    boolean enabled() {return enabled;}

    public Optional<SemanticDecision> classify(AssistantRequest request) {
        var state = request.conversationContext();
        var conversation = new LinkedHashMap<String, Object>();
        if (state != null && state.lastIntent() != null) {
            conversation.put("lastIntent", state.lastIntent());
            conversation.put("displayedHotels", state.hotelIds() == null ? 0 : state.hotelIds().size());
            conversation.put("recommendedHotels", state.recommendedHotelIds() == null ? 0 : state.recommendedHotelIds().size());
            if (DialoguePolicy.pendingLandmark(request)) {
                conversation.put("pendingSlot", "landmark");
            }
            if ("DIRECTIONS".equals(state.lastIntent()) && state.lastDirections()!=null) {
                if (state.lastDirections().hotelChoiceRequired() || state.lastDirections().originResolved()) conversation.put("pendingSlot","routeHotel");
                else if (!state.lastDirections().originResolved()) conversation.put("pendingSlot","routeOrigin");
            }
        }
        // Only bounded user questions are needed to recover an unresolved goal.
        // No assistant tables, credentials, or private booking records enter the model prompt.
        var questions = request.history() == null ? List.<String>of() : request.history().stream()
                .filter(java.util.Objects::nonNull)
                .filter(item -> "user".equals(item.role()) && item.content() != null)
                .map(item -> item.content().substring(0, Math.min(500, item.content().length()))).toList();
        if (!questions.isEmpty()) conversation.put("recentUserQuestions", questions.subList(Math.max(0, questions.size()-3), questions.size()));
        if (conversation.isEmpty()) return classify(request.message(), request.hotelId() != null);
        return classifyPayload(Map.of("message", request.message(), "hotelContext", request.hotelId() != null, "conversation", conversation));
    }

    private Optional<SemanticDecision> classifyPayload(Map<String, Object> body) {
        if (!enabled) return Optional.empty();
        try {
            byte[] payload = json.writeValueAsBytes(body);
            SemanticDecision decision = client.post().uri("/classify")
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .contentLength(payload.length).body(payload).retrieve().body(SemanticDecision.class);
            if (decision == null || !INTENTS.contains(decision.intent()) || decision.confidence() < .76
                    || !Set.of("Xenova/multilingual-e5-small", "Qwen3-4B-Instruct-2507-Q4_K_M").contains(decision.model())) return Optional.empty();
            return Optional.of(decision);
        } catch (org.springframework.web.client.RestClientException | JsonProcessingException failure) {
            return Optional.empty();
        }
    }
}
