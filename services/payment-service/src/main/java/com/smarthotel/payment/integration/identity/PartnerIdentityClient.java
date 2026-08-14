package com.smarthotel.payment.integration.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.text.Normalizer;
import java.util.Locale;

@Component
public class PartnerIdentityClient {

    private final RestClient restClient;

    public PartnerIdentityClient(
            @Value("${clients.identity.base-url}") String identityServiceUrl
    ) {
        this.restClient = RestClient.builder().baseUrl(identityServiceUrl).build();
    }

    public PayoutProfile getApprovedPayoutProfile(String accessToken) {
        if (accessToken == null || accessToken.isBlank()) {
            throw new IllegalStateException("Thiếu access token để kiểm tra hồ sơ nhận tiền");
        }
        PayoutProfile result = restClient.get()
                .uri("/api/partner-requests/me/payout-profile")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    throw new IllegalStateException(
                            "Không thể xác minh tài khoản nhận tiền với Identity Service (HTTP "
                                    + response.getStatusCode().value() + ")"
                    );
                })
                .body(PayoutProfile.class);
        if (result == null || !result.lockedByApprovedPartnerProfile()) {
            throw new IllegalStateException("Hồ sơ nhận tiền của đối tác chưa được System Admin phê duyệt");
        }
        return result;
    }

    public void validateWithdrawalDestination(
            String accessToken,
            String bankName,
            String bankBin,
            String accountNumber,
            String accountName
    ) {
        PayoutProfile profile = getApprovedPayoutProfile(accessToken);
        if (!digits(profile.bankBin()).equals(digits(bankBin))
                || !digits(profile.accountNumber()).equals(digits(accountNumber))
                || !normalized(profile.accountName()).equals(normalized(accountName))
                || !normalized(profile.bankName()).equals(normalized(bankName))) {
            throw new IllegalArgumentException(
                    "Tài khoản nhận tiền không trùng hồ sơ đối tác đã được duyệt. "
                            + "Để thay đổi tài khoản nhận tiền, cần xác minh và được System Admin duyệt lại."
            );
        }
    }

    private String digits(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    private String normalized(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]", "");
    }

    public record PayoutProfile(
            String applicantType,
            String legalName,
            String representativeName,
            String bankName,
            String bankBin,
            String accountNumber,
            String accountName,
            boolean lockedByApprovedPartnerProfile
    ) {
    }
}
