package com.smarthotel.booking.integration.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.UUID;

@Component
public class IdentityClient {

    private final RestClient restClient;

    public IdentityClient(
            @Value("${clients.identity.base-url}") String identityServiceUrl
    ) {
        this.restClient = RestClient.builder()
                .baseUrl(identityServiceUrl)
                .build();
    }

    /**
     * Chỉ lấy dữ liệu công khai tối thiểu. Nếu Identity Service tạm thời
     * không phản hồi thì review vẫn hiển thị bằng dữ liệu snapshot cũ.
     */
    public PublicUserProfile getPublicProfile(UUID userId) {
        if (userId == null) {
            return null;
        }

        try {
            return restClient.get()
                    .uri("/api/users/{userId}/public-profile", userId)
                    .retrieve()
                    .body(PublicUserProfile.class);
        } catch (RestClientException | IllegalArgumentException exception) {
            return null;
        }
    }

    public record PublicUserProfile(
            UUID userId,
            String fullName,
            String avatarUrl
    ) {
    }
}
