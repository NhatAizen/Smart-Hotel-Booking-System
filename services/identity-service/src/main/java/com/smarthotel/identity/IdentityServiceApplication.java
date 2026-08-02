package com.smarthotel.identity;

import com.smarthotel.identity.mail.AppMailProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication(
        exclude = UserDetailsServiceAutoConfiguration.class
)
@EnableConfigurationProperties(
        AppMailProperties.class
)
public class IdentityServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(
                IdentityServiceApplication.class,
                args
        );
    }
}