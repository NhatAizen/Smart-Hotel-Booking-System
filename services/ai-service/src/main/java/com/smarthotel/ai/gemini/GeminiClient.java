package com.smarthotel.ai.gemini;

import com.smarthotel.ai.common.exception.AiProviderException;
import com.smarthotel.ai.gemini.dto.GeminiGenerateRequest;
import com.smarthotel.ai.gemini.dto.GeminiGenerateResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;

@Component
public class GeminiClient {

    private final WebClient webClient;
    private final String apiKey;
    private final String model;

    public GeminiClient(
            WebClient geminiWebClient,
            @Value("${app.gemini.api-key}") String apiKey,
            @Value("${app.gemini.model}") String model
    ) {
        this.webClient = geminiWebClient;
        this.apiKey = apiKey;
        this.model = model;
    }

    public String generate(String prompt) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new AiProviderException(
                    "GEMINI_API_KEY is not configured"
            );
        }

        GeminiGenerateRequest request =
                new GeminiGenerateRequest(
                        List.of(
                                new GeminiGenerateRequest.Content(
                                        "user",
                                        List.of(
                                                new GeminiGenerateRequest.Part(
                                                        prompt
                                                )
                                        )
                                )
                        ),
                        new GeminiGenerateRequest.GenerationConfig(
                                0.4,
                                1200
                        )
                );

        try {
            GeminiGenerateResponse response =
                    webClient
                            .post()
                            .uri(uriBuilder -> uriBuilder
                                    .path(
                                            "/models/{model}:generateContent"
                                    )
                                    .queryParam("key", apiKey)
                                    .build(model)
                            )
                            .bodyValue(request)
                            .retrieve()
                            .onStatus(
                                    HttpStatusCode::isError,
                                    clientResponse ->
                                            clientResponse
                                                    .bodyToMono(String.class)
                                                    .map(body ->
                                                            new AiProviderException(
                                                                    "Gemini API error: "
                                                                            + body
                                                            )
                                                    )
                            )
                            .bodyToMono(
                                    GeminiGenerateResponse.class
                            )
                            .block();

            return extractText(response);

        } catch (AiProviderException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new AiProviderException(
                    "Unable to call Gemini API",
                    exception
            );
        }
    }

    private String extractText(
            GeminiGenerateResponse response
    ) {
        if (response == null
                || response.candidates() == null
                || response.candidates().isEmpty()
                || response.candidates().get(0).content() == null
                || response.candidates().get(0).content().parts() == null
                || response.candidates().get(0).content().parts().isEmpty()) {

            throw new AiProviderException(
                    "Gemini returned an empty response"
            );
        }

        return response.candidates()
                .get(0)
                .content()
                .parts()
                .stream()
                .map(GeminiGenerateResponse.Part::text)
                .filter(text -> text != null && !text.isBlank())
                .reduce("", (left, right) -> left + right)
                .trim();
    }
}