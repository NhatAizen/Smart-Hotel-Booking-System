package com.smarthotel.ai.assistant.v2.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record SemanticDecision(String intent, String topic, String preference, double confidence,
                               double margin, String model, String revision, String action, SemanticSlots slots) {
    public SemanticDecision(String intent, String topic, String preference, double confidence,
                            double margin, String model, String revision, String action) {
        this(intent, topic, preference, confidence, margin, model, revision, action, null);
    }
    public SemanticDecision(String intent, String topic, String preference, double confidence,
                            double margin, String model, String revision) {
        this(intent, topic, preference, confidence, margin, model, revision, "NONE");
    }
}
