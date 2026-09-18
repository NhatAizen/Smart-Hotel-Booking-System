package com.smarthotel.realtime.config;

import com.smarthotel.realtime.security.JwtHandshakeInterceptor;
import com.smarthotel.realtime.websocket.RealtimeWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final RealtimeWebSocketHandler handler;
    private final JwtHandshakeInterceptor interceptor;
    private final String[] allowedOriginPatterns;

    public WebSocketConfig(
            RealtimeWebSocketHandler handler,
            JwtHandshakeInterceptor interceptor,
            @Value("${app.realtime.allowed-origin-patterns}") String allowedOriginPatterns
    ) {
        this.handler = handler;
        this.interceptor = interceptor;
        this.allowedOriginPatterns = allowedOriginPatterns.split("\\s*,\\s*");
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/realtime")
                .addInterceptors(interceptor)
                .setAllowedOriginPatterns(allowedOriginPatterns);
    }
}
