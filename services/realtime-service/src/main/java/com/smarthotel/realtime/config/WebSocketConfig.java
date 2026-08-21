package com.smarthotel.realtime.config;

import com.smarthotel.realtime.security.JwtHandshakeInterceptor;
import com.smarthotel.realtime.websocket.RealtimeWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final RealtimeWebSocketHandler handler;
    private final JwtHandshakeInterceptor interceptor;

    public WebSocketConfig(RealtimeWebSocketHandler handler, JwtHandshakeInterceptor interceptor) {
        this.handler = handler;
        this.interceptor = interceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/realtime")
                .addInterceptors(interceptor)
                .setAllowedOriginPatterns("*");
    }
}
