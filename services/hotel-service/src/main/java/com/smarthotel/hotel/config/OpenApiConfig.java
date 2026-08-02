package com.smarthotel.hotel.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI hotelServiceOpenApi() {
        return new OpenAPI()
                .info(
                        new Info()
                                .title("Smart Hotel Service API")
                                .description(
                                        "API quản lý khách sạn và phòng"
                                )
                                .version("1.0.0")
                );
    }
}