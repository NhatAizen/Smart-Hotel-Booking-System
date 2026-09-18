package com.smarthotel.payment.observability;

import org.slf4j.MDC;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class CorrelationIdRestClientCustomizer implements RestClientCustomizer {
    @Override
    public void customize(RestClient.Builder builder) {
        builder.requestInterceptor(interceptor());
    }

    public static ClientHttpRequestInterceptor interceptor() {
        return (request, body, execution) -> {
            String correlationId = MDC.get(CorrelationIdFilter.MDC_KEY);
            if (correlationId != null && !correlationId.isBlank()) {
                request.getHeaders().set(CorrelationIdFilter.HEADER, correlationId);
            }
            return execution.execute(request, body);
        };
    }
}
