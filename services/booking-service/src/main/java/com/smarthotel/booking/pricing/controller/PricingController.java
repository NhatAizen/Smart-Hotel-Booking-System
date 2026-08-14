package com.smarthotel.booking.pricing.controller;

import com.smarthotel.booking.pricing.dto.PricingQuoteRequest;
import com.smarthotel.booking.pricing.dto.PricingQuoteResponse;
import com.smarthotel.booking.pricing.service.PricingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pricing")
@Tag(name = "Pricing", description = "Báo giá động theo ngày lưu trú")
public class PricingController {
    private final PricingService pricingService;

    public PricingController(PricingService pricingService) {
        this.pricingService = pricingService;
    }

    @Operation(summary = "Báo giá chính xác theo từng đêm, cuối tuần và ngày đặc biệt")
    @PostMapping("/quote")
    public ResponseEntity<PricingQuoteResponse> quote(
            @Valid @RequestBody PricingQuoteRequest request
    ) {
        return ResponseEntity.ok(pricingService.quote(request));
    }
}
