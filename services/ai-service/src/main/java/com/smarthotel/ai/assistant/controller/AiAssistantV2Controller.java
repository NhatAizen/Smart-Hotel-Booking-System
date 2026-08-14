package com.smarthotel.ai.assistant.controller;

import com.smarthotel.ai.assistant.v2.dto.AssistantRequest;
import com.smarthotel.ai.assistant.v2.dto.AssistantResponse;
import com.smarthotel.ai.assistant.v2.service.GroundedAssistantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
@Tag(name = "AI Assistant V2", description = "Grounded AI using real hotel, booking and review data")
public class AiAssistantV2Controller {

    private final GroundedAssistantService groundedAssistantService;

    public AiAssistantV2Controller(GroundedAssistantService groundedAssistantService) {
        this.groundedAssistantService = groundedAssistantService;
    }

    @Operation(summary = "Customer chat với Enziu AI bằng dữ liệu thật")
    @PostMapping("/assistant")
    public ResponseEntity<AssistantResponse> assistant(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody AssistantRequest request
    ) {
        return ResponseEntity.ok(groundedAssistantService.answer(request, jwt));
    }
}
