package com.smarthotel.notification.mail;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class MailConfigurationTest {
    @Test
    void gmailAuthenticationAndTlsFollowEnvironmentSettings() {
        var yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application.yml"));
        var environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("smtp-test", Map.of(
                "MAIL_SMTP_AUTH", "true", "MAIL_STARTTLS_ENABLE", "true")));
        environment.getPropertySources().addLast(new PropertiesPropertySource("application", yaml.getObject()));
        assertThat(environment.getProperty("spring.mail.properties.mail.smtp.auth", Boolean.class)).isTrue();
        assertThat(environment.getProperty("spring.mail.properties.mail.smtp.starttls.enable", Boolean.class)).isTrue();
        assertThat(environment.getProperty("spring.mail.properties.mail.smtp.timeout", Integer.class)).isEqualTo(10000);
    }
}
