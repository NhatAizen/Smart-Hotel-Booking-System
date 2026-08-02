package com.smarthotel.gateway.filter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class RequestLoggingFilter
        implements GlobalFilter, Ordered {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(RequestLoggingFilter.class);

    @Override
    public Mono<Void> filter(
            ServerWebExchange exchange,
            GatewayFilterChain chain
    ) {
        long startedAt = System.currentTimeMillis();

        String method = exchange
                .getRequest()
                .getMethod()
                .name();

        String path = exchange
                .getRequest()
                .getURI()
                .getPath();

        return chain.filter(exchange)
                .doFinally(signalType -> {
                    int status =
                            exchange.getResponse()
                                    .getStatusCode() == null
                                    ? 0
                                    : exchange.getResponse()
                                            .getStatusCode()
                                            .value();

                    long duration =
                            System.currentTimeMillis()
                                    - startedAt;

                    LOGGER.info(
                            "{} {} -> {} ({} ms)",
                            method,
                            path,
                            status,
                            duration
                    );
                });
    }

    @Override
    public int getOrder() {
        return -1;
    }
}