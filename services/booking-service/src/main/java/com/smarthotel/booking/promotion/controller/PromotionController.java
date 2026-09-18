package com.smarthotel.booking.promotion.controller;

import com.smarthotel.booking.membership.dto.MembershipProfileResponse;
import com.smarthotel.booking.membership.dto.MembershipTierResponse;
import com.smarthotel.booking.membership.dto.UpdateMembershipTierRequest;
import com.smarthotel.booking.membership.service.MembershipService;
import com.smarthotel.booking.promotion.dto.*;
import com.smarthotel.booking.promotion.service.PromotionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class PromotionController {
    private final PromotionService promotions;
    private final MembershipService memberships;

    public PromotionController(PromotionService promotions, MembershipService memberships) {
        this.promotions = promotions;
        this.memberships = memberships;
    }

    @GetMapping("/membership/me")
    public MembershipProfileResponse me(@AuthenticationPrincipal Jwt jwt) {
        return memberships.profile(uid(jwt));
    }

    @GetMapping("/membership/tiers")
    public List<MembershipTierResponse> publicTiers() {
        return memberships.tiers();
    }

    @GetMapping("/admin/membership-tiers")
    public List<MembershipTierResponse> tiers() {
        return memberships.tiers();
    }

    @PutMapping("/admin/membership-tiers/{level}")
    public MembershipTierResponse updateTier(
            @PathVariable Integer level,
            @Valid @RequestBody UpdateMembershipTierRequest request
    ) {
        return memberships.update(level, request);
    }

    @PostMapping("/hotel-admin/promotions")
    @ResponseStatus(HttpStatus.CREATED)
    public PromotionResponse createHotel(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreatePromotionRequest request
    ) {
        return promotions.createHotel(uid(jwt), request);
    }

    @GetMapping("/hotel-admin/promotions")
    public List<PromotionResponse> hotelMine(@AuthenticationPrincipal Jwt jwt) {
        return promotions.mine(uid(jwt));
    }

    @PatchMapping("/hotel-admin/promotions/{id}/active")
    public PromotionResponse hotelActive(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestParam boolean active
    ) {
        return promotions.setActive(id, active, uid(jwt), false);
    }

    @PostMapping("/admin/promotions")
    @ResponseStatus(HttpStatus.CREATED)
    public PromotionResponse createPlatform(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreatePromotionRequest request
    ) {
        return promotions.createPlatform(uid(jwt), request);
    }

    @GetMapping("/admin/promotions")
    public List<PromotionResponse> platform() {
        return promotions.platform();
    }

    @PatchMapping("/admin/promotions/{id}/active")
    public PromotionResponse adminActive(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestParam boolean active
    ) {
        return promotions.setActive(id, active, uid(jwt), true);
    }

    /**
     * Public active promotions. With a hotelId it returns applicable platform/hotel offers;
     * without one it returns platform offers only for public discovery surfaces.
     */
    @GetMapping("/promotions/available")
    public List<PromotionResponse> available(@RequestParam(required = false) UUID hotelId) {
        return promotions.publicApplicable(hotelId);
    }

    /** Customer-specific list used on checkout: valid now, valid for this hotel/amount and remaining user quota. */
    @GetMapping("/promotions/recommendations")
    public List<PromotionSuggestionResponse> recommendations(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam UUID hotelId,
            @RequestParam BigDecimal amount
    ) {
        return promotions.recommendations(uid(jwt), hotelId, amount);
    }

    @GetMapping("/promotions/saved/me")
    public List<PromotionResponse> saved(@AuthenticationPrincipal Jwt jwt) {
        return promotions.saved(uid(jwt));
    }

    @PostMapping("/promotions/{promotionId}/save")
    public PromotionResponse save(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID promotionId
    ) {
        return promotions.save(uid(jwt), promotionId);
    }

    @DeleteMapping("/promotions/{promotionId}/save")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unsave(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID promotionId
    ) {
        promotions.unsave(uid(jwt), promotionId);
    }

    @PostMapping("/discounts/preview")
    public DiscountPreviewResponse preview(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody DiscountPreviewRequest request
    ) {
        return promotions.preview(uid(jwt), request);
    }

    @PostMapping("/admin/campaigns")
    @ResponseStatus(HttpStatus.CREATED)
    public CampaignResponse createCampaign(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateCampaignRequest request
    ) {
        return promotions.createCampaign(uid(jwt), request);
    }

    @GetMapping("/admin/campaigns")
    public List<CampaignResponse> campaignsAdmin() {
        return promotions.campaignsAdmin();
    }

    @PatchMapping("/admin/campaigns/{id}/active")
    public CampaignResponse campaignActive(
            @PathVariable UUID id,
            @RequestParam boolean active
    ) {
        return promotions.setCampaignActive(id, active);
    }

    @GetMapping("/campaigns/active")
    public List<CampaignResponse> activeCampaigns() {
        return promotions.publicCampaigns();
    }

    private UUID uid(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
