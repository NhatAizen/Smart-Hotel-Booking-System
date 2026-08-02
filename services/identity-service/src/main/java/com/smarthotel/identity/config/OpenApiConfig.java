package com.smarthotel.identity.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    private static final String BEARER_AUTH = "bearerAuth";

    @Bean
    public OpenAPI identityServiceOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Smart Hotel Identity Service API")
                        .description("""
                                API đăng ký, đăng nhập, JWT, refresh token,
                                xác thực email và đặt lại mật khẩu.
                                """)
                        .version("1.0.0")
                        .contact(new Contact()
                                .name("Smart Hotel Team"))
                        .license(new License()
                                .name("Private educational project")))
                .components(new Components()
                        .addSecuritySchemes(
                                BEARER_AUTH,
                                new SecurityScheme()
                                        .name(BEARER_AUTH)
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")
                        ));
    }
}