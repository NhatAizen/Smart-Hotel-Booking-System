package com.smarthotel.identity.partnerrequest.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "partner-documents")
public record PartnerDocumentProperties(
        String uploadDir,
        long maxFileSizeBytes
) {
    public PartnerDocumentProperties {
        if (uploadDir == null || uploadDir.isBlank()) {
            uploadDir = "./uploads/partner-documents";
        }
        if (maxFileSizeBytes <= 0) {
            maxFileSizeBytes = 8L * 1024L * 1024L;
        }
    }
}
