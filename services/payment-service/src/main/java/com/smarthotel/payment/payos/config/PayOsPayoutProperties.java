package com.smarthotel.payment.payos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "payos.payout")
public class PayOsPayoutProperties {
    private boolean enabled = false;
    private String clientId;
    private String apiKey;
    private String checksumKey;
    private String baseUrl = "https://api-merchant.payos.vn";

    public boolean isConfigured() {
        return enabled && hasText(clientId) && hasText(apiKey) && hasText(checksumKey);
    }
    private boolean hasText(String value) { return value != null && !value.isBlank(); }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getChecksumKey() { return checksumKey; }
    public void setChecksumKey(String checksumKey) { this.checksumKey = checksumKey; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
}
