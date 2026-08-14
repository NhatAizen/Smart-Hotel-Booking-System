package com.smarthotel.identity;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@ActiveProfiles("test")
@SpringBootTest(
        properties = {
                "app.jwt.secret=ZW56aXVyb29tcy10ZXN0LWp3dC1zZWNyZXQta2V5LTMy",
                "app.jwt.issuer=smart-hotel-identity-service-test",
                "app.jwt.expiration-seconds=3600",
                "app.jwt.refresh-expiration-seconds=2592000",

                "spring.security.oauth2.client.registration.google.client-id=test-google-client-id",
                "spring.security.oauth2.client.registration.google.client-secret=test-google-client-secret",
                "spring.security.oauth2.client.registration.google.authorization-grant-type=authorization_code",
                "spring.security.oauth2.client.registration.google.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}",
                "spring.security.oauth2.client.registration.google.scope=openid,profile,email",
                "spring.security.oauth2.client.provider.google.authorization-uri=https://accounts.google.com/o/oauth2/v2/auth",
                "spring.security.oauth2.client.provider.google.token-uri=https://oauth2.googleapis.com/token",
                "spring.security.oauth2.client.provider.google.user-info-uri=https://openidconnect.googleapis.com/v1/userinfo",
                "spring.security.oauth2.client.provider.google.jwk-set-uri=https://www.googleapis.com/oauth2/v3/certs",
                "spring.security.oauth2.client.provider.google.user-name-attribute=sub",

                "app.oauth2.frontend-callback-url=http://localhost:5173/oauth2/callback",
                "app.oauth2.authorization-code-expiration-seconds=120"
        }
)
class IdentityServiceApplicationTests {

    @Test
    void contextLoads() {
    }
}