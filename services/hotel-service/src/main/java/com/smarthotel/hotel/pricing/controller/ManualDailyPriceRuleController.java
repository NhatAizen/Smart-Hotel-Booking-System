package com.smarthotel.hotel.pricing.controller;

import com.smarthotel.hotel.pricing.dto.ManualDailyPricePreviewResponse;
import com.smarthotel.hotel.pricing.dto.ManualDailyPriceRuleInput;
import com.smarthotel.hotel.pricing.dto.ManualDailyPriceRuleResponse;
import com.smarthotel.hotel.pricing.service.ManualDailyPriceRuleService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/hotels/{hotelId}/daily-price-rules")
public class ManualDailyPriceRuleController {
    private final ManualDailyPriceRuleService service;

    public ManualDailyPriceRuleController(ManualDailyPriceRuleService service) {
        this.service = service;
    }

    @GetMapping
    public List<ManualDailyPriceRuleResponse> list(@AuthenticationPrincipal Jwt jwt,
                                                    @PathVariable UUID hotelId) {
        return service.list(userId(jwt), hotelId);
    }

    @PostMapping
    public ResponseEntity<ManualDailyPriceRuleResponse> create(@AuthenticationPrincipal Jwt jwt,
                                                                @PathVariable UUID hotelId,
                                                                @Valid @RequestBody ManualDailyPriceRuleInput input) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(userId(jwt), hotelId, input));
    }

    @PutMapping("/{ruleId}")
    public ManualDailyPriceRuleResponse update(@AuthenticationPrincipal Jwt jwt,
                                               @PathVariable UUID hotelId,
                                               @PathVariable UUID ruleId,
                                               @Valid @RequestBody ManualDailyPriceRuleInput input) {
        return service.update(userId(jwt), hotelId, ruleId, input);
    }

    @DeleteMapping("/{ruleId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt,
                                       @PathVariable UUID hotelId,
                                       @PathVariable UUID ruleId) {
        service.delete(userId(jwt), hotelId, ruleId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/preview")
    public ManualDailyPricePreviewResponse preview(@AuthenticationPrincipal Jwt jwt,
                                                   @PathVariable UUID hotelId,
                                                   @RequestParam(required = false) UUID editingRuleId,
                                                   @RequestParam(required = false) LocalDate pageStart,
                                                   @Valid @RequestBody ManualDailyPriceRuleInput input) {
        return service.preview(userId(jwt), hotelId, input, editingRuleId, pageStart);
    }

    private UUID userId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
