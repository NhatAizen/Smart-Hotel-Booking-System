package com.smarthotel.booking.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI bookingServiceOpenApi() {
        return new OpenAPI()
                .info(
                        new Info()
                                .title("Smart Hotel Booking Service API")
                                .description(
                                        "API tạo booking, kiểm tra trùng lịch và quản lý trạng thái đặt phòng"
                                )
                                .version("1.0.0")
                );
    }
}