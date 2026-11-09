package com.smarthotel.ai.assistant.v2.service;

import java.util.Map;
import java.util.Set;

/** Capability contracts are independent of utterances and model predictions. */
final class AssistantContract {
    private AssistantContract() {}
    static final Map<String, Set<String>> ACTIONS = Map.ofEntries(
            Map.entry("RECOMMEND_HOTELS", Set.of("NONE", "NEW_SEARCH", "MORE_HOTELS", "REFINE_SEARCH", "RECHECK_TRIP")),
            Map.entry("ROOM_RECOMMEND", Set.of("NONE", "MORE_ROOMS", "REFINE_SEARCH", "RECHECK_TRIP", "SELECT_OPTION")),
            Map.entry("HOTEL_DETAILS", Set.of("NONE", "SELECT_OPTION")),
            Map.entry("DIRECTIONS", Set.of("NONE")),
            Map.entry("COMPARE_HOTELS", Set.of("NONE", "CHOOSE_OPTION")),
            Map.entry("ROOM_COMPARE", Set.of("NONE")),
            Map.entry("REVIEW_SUMMARY", Set.of("NONE")),
            Map.entry("MY_BOOKINGS", Set.of("NONE")),
            Map.entry("GENERAL", Set.of("NONE")),
            Map.entry("OUT_OF_SCOPE", Set.of("NONE")),
            Map.entry("CLARIFY", Set.of("NONE")));

    static boolean accepts(String intent, String action) {
        return intent != null && action != null && ACTIONS.getOrDefault(intent, Set.of()).contains(action);
    }
}
