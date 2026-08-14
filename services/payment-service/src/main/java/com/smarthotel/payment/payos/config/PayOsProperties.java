package com.smarthotel.payment.payos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

@ConfigurationProperties(prefix = "payos")
public class PayOsProperties {

    private boolean enabled = true;
    private String clientId;
    private String apiKey;
    private String checksumKey;
    private String baseUrl = "https://api-merchant.payos.vn";
    private String returnUrl = "http://localhost:5300/payment/payos/success";
    private String cancelUrl = "http://localhost:5300/payment/payos/cancel";
    private String webhookUrl;
    private BigDecimal commissionRate = new BigDecimal("10.00");
    private boolean autoReleaseHotelRevenue = false;

    public boolean isConfigured() {
        return enabled
                && hasText(clientId)
                && hasText(apiKey)
                && hasText(checksumKey);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

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
    public String getReturnUrl() { return returnUrl; }
    public void setReturnUrl(String returnUrl) { this.returnUrl = returnUrl; }
    public String getCancelUrl() { return cancelUrl; }
    public void setCancelUrl(String cancelUrl) { this.cancelUrl = cancelUrl; }
    public String getWebhookUrl() { return webhookUrl; }
    public void setWebhookUrl(String webhookUrl) { this.webhookUrl = webhookUrl; }
    public BigDecimal getCommissionRate() { return commissionRate; }
    public void setCommissionRate(BigDecimal commissionRate) { this.commissionRate = commissionRate; }
    public boolean isAutoReleaseHotelRevenue() { return autoReleaseHotelRevenue; }
    public void setAutoReleaseHotelRevenue(boolean autoReleaseHotelRevenue) {
        this.autoReleaseHotelRevenue = autoReleaseHotelRevenue;
    }
}
