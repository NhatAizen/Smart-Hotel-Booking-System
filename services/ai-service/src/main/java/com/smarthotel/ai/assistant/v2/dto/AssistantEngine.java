package com.smarthotel.ai.assistant.v2.dto;

/** Server-side provenance for the engine that actually answered the request. */
public record AssistantEngine(String id, String mode, boolean externalModelUsed, String semanticModel, boolean semanticUnderstandingUsed) {
    public static AssistantEngine local(String version) {
        return new AssistantEngine(version, "LOCAL_RULES_AND_SYSTEM_DATA", false, null, false);
    }

    public static AssistantEngine semantic(String version, String model) {
        return new AssistantEngine(version, "LOCAL_SEMANTIC_AND_SYSTEM_DATA", false, model, true);
    }
}
