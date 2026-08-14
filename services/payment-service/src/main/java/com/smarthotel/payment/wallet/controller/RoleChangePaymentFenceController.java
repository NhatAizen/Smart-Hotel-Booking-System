package com.smarthotel.payment.wallet.controller;

import com.smarthotel.payment.wallet.dto.DemotionFenceRequest;
import com.smarthotel.payment.wallet.service.HotelAdminDemotionFenceService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/role-change/owners/{ownerId}/demotion-fence")
public class RoleChangePaymentFenceController {

    private final HotelAdminDemotionFenceService fenceService;

    public RoleChangePaymentFenceController(HotelAdminDemotionFenceService fenceService) {
        this.fenceService = fenceService;
    }

    @PutMapping
    public ResponseEntity<Void> acquire(
            @PathVariable UUID ownerId,
            @Valid @RequestBody DemotionFenceRequest request
    ) {
        fenceService.acquire(ownerId, request.transitionId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{transitionId}")
    public ResponseEntity<Void> release(
            @PathVariable UUID ownerId,
            @PathVariable UUID transitionId
    ) {
        fenceService.release(ownerId, transitionId);
        return ResponseEntity.noContent().build();
    }
}
