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
    @org.springframework.beans.factory.annotation.Autowired com.smarthotel.identity.user.repository.UserRepository users;
    @org.springframework.beans.factory.annotation.Autowired com.smarthotel.identity.partnerrequest.repository.PartnerRequestRepository requests;
    @org.springframework.beans.factory.annotation.Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Test
    @org.springframework.transaction.annotation.Transactional
    void onlyDeletedApplicantsReleaseAnIdentityNumber() {
        var applicant=users.saveAndFlush(new com.smarthotel.identity.user.entity.User("synthetic_partner", "synthetic@example.invalid", "unused", "SYNTHETIC TEST", com.smarthotel.identity.user.entity.UserRole.CUSTOMER));
        var other=java.util.UUID.randomUUID();
        jdbc.update("insert into partner_requests (id,user_id,applicant_type,legal_name,identity_number,business_phone,business_address,status,cccd_front_path,cccd_back_path) values (?,?, 'INDIVIDUAL','SYNTHETIC TEST','079099123456','0000000000','TEST ONLY','PENDING','test/front.png','test/back.png')",java.util.UUID.randomUUID(),applicant.getId());
        org.junit.jupiter.api.Assertions.assertTrue(requests.existsByIdentityNumberAndUserIdNot("079099123456",other));
        org.junit.jupiter.api.Assertions.assertFalse(requests.existsByIdentityNumberAndUserIdNot("079099123456",applicant.getId()));
        applicant.deactivate();users.saveAndFlush(applicant);
        org.junit.jupiter.api.Assertions.assertTrue(requests.existsByIdentityNumberAndUserIdNot("079099123456",other));
        applicant.softDelete();users.saveAndFlush(applicant);
        org.junit.jupiter.api.Assertions.assertFalse(requests.existsByIdentityNumberAndUserIdNot("079099123456",other));
    }

    @Test
    void contextLoads() {
    }
}
