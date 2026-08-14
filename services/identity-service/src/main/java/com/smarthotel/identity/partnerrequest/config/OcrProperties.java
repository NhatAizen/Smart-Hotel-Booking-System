package com.smarthotel.identity.partnerrequest.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "partner-ocr")
public record OcrProperties(
        String command,
        String languages,
        long timeoutSeconds
) {
    public OcrProperties {
        if (command == null || command.isBlank()) {
            command = "tesseract";
        }
        if (languages == null || languages.isBlank()) {
            languages = "vie+eng";
        }
        if (timeoutSeconds <= 0) {
            timeoutSeconds = 20;
        }
    }
}
