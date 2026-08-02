package com.smarthotel.notification.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI notificationServiceOpenApi() {
        return new OpenAPI()
                .info(
                        new Info()
                                .title("Smart Hotel Notification Service API")
                                .description(
                                        "API for creating notifications, sending emails, marking notifications as read, and resending emails"
                                )
                                .version("1.0.0")
                );
    }
}