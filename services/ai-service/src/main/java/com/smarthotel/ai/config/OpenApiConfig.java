package com.smarthotel.ai.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI aiServiceOpenApi() {
        return new OpenAPI()
                .info(
                        new Info()
                                .title("Smart Hotel AI Service API")
                                .description(
                                        "AI chatbot, hotel recommendation, and review summarization APIs"
                                )
                                .version("1.0.0")
                );
    }
}