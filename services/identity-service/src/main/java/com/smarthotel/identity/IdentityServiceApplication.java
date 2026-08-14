package com.smarthotel.identity;

import com.smarthotel.identity.mail.AppMailProperties;
import com.smarthotel.identity.partnerrequest.config.OcrProperties;
import com.smarthotel.identity.partnerrequest.config.PartnerDocumentProperties;
import com.smarthotel.identity.partnerrequest.config.PartnerEkycProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication(
        exclude = UserDetailsServiceAutoConfiguration.class
)
@EnableConfigurationProperties({
        AppMailProperties.class,
        PartnerDocumentProperties.class,
        OcrProperties.class,
        PartnerEkycProperties.class
})
public class IdentityServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(
                IdentityServiceApplication.class,
                args
        );
    }
}