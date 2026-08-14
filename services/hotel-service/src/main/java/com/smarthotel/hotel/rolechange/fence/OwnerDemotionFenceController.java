package com.smarthotel.hotel.rolechange.fence;

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
public class OwnerDemotionFenceController {

    private final OwnerDemotionFenceService fenceService;

    public OwnerDemotionFenceController(OwnerDemotionFenceService fenceService) {
        this.fenceService = fenceService;
    }

    @PutMapping
    public ResponseEntity<OwnerDemotionFenceResponse> freeze(
            @PathVariable UUID ownerId,
            @Valid @RequestBody OwnerDemotionFenceRequest request
    ) {
        return ResponseEntity.ok(fenceService.freeze(ownerId, request.transitionId()));
    }

    @DeleteMapping("/{transitionId}")
    public ResponseEntity<Void> unfreeze(
            @PathVariable UUID ownerId,
            @PathVariable UUID transitionId
    ) {
        fenceService.unfreeze(ownerId, transitionId);
        return ResponseEntity.noContent().build();
    }
}

