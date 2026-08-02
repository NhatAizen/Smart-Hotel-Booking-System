package com.smarthotel.ai.config;

import io.netty.channel.ChannelOption;
import io.netty.handler.timeout.ReadTimeoutHandler;
import io.netty.handler.timeout.WriteTimeoutHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

@Configuration
public class WebClientConfig {

    @Bean
    public WebClient geminiWebClient(
            WebClient.Builder builder,
            @Value("${app.gemini.base-url}") String baseUrl,
            @Value("${app.gemini.timeout-seconds}") int timeoutSeconds
    ) {
        HttpClient httpClient = HttpClient.create()
                .option(
                        ChannelOption.CONNECT_TIMEOUT_MILLIS,
                        timeoutSeconds * 1000
                )
                .responseTimeout(
                        Duration.ofSeconds(timeoutSeconds)
                )
                .doOnConnected(connection -> connection
                        .addHandlerLast(
                                new ReadTimeoutHandler(
                                        timeoutSeconds,
                                        TimeUnit.SECONDS
                                )
                        )
                        .addHandlerLast(
                                new WriteTimeoutHandler(
                                        timeoutSeconds,
                                        TimeUnit.SECONDS
                                )
                        )
                );

        return builder
                .baseUrl(baseUrl)
                .clientConnector(
                        new ReactorClientHttpConnector(httpClient)
                )
                .build();
    }
}