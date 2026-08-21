package com.smarthotel.booking.promotion.service;

import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.membership.dto.MembershipProfileResponse;
import com.smarthotel.booking.membership.service.MembershipService;
import com.smarthotel.booking.promotion.dto.*;
import com.smarthotel.booking.promotion.entity.*;
import com.smarthotel.booking.promotion.repository.*;
import com.smarthotel.booking.realtime.RealtimeEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;

@Service
public class PromotionService {
    private final PromotionRepository promotions;
    private final PromotionUsageRepository usages;
    private final CampaignRepository campaigns;
    private final SavedPromotionRepository savedPromotions;
    private final MembershipService memberships;
    private final HotelClient hotelClient;
    private final RealtimeEventPublisher realtime;

    public PromotionService(
            PromotionRepository promotions,
            PromotionUsageRepository usages,
            CampaignRepository campaigns,
            SavedPromotionRepository savedPromotions,
            MembershipService memberships,
            HotelClient hotelClient,
            RealtimeEventPublisher realtime
    ) {
        this.promotions = promotions;
        this.usages = usages;
        this.campaigns = campaigns;
        this.savedPromotions = savedPromotions;
        this.memberships = memberships;
        this.hotelClient = hotelClient;
        this.realtime = realtime;
    }

    @Transactional
    public PromotionResponse createHotel(UUID userId, CreatePromotionRequest request) {
        validateCreationWindow(request.startAt(), request.endAt(), "khuyến mãi");
        if (request.hotelId() == null) {
            throw new IllegalArgumentException("Vui lòng chọn khách sạn");
        }

        var hotel = hotelClient.getHotel(request.hotelId());
        if (!userId.equals(hotel.ownerId())) {
            throw new IllegalStateException("Bạn chỉ có thể tạo ưu đãi cho khách sạn của mình");
        }

        ensureCodeAvailable(request.code());
        Promotion promotion = build(request, PromotionScope.HOTEL, FundingSource.HOTEL, userId);
        promotions.save(promotion);

        // Hotel promotion is public once active, so broadcast lets hotel-detail pages refresh immediately.
        realtime.promotionChanged(
                "HOTEL_PROMOTION_CREATED",
                promotion.getHotelId(),
                promotion.getCode(),
                true
        );
        return PromotionResponse.from(promotion);
    }

    @Transactional
    public PromotionResponse createPlatform(UUID adminId, CreatePromotionRequest request) {
        validateCreationWindow(request.startAt(), request.endAt(), "khuyến mãi");
        ensureCodeAvailable(request.code());
        Promotion promotion = build(request, PromotionScope.PLATFORM, FundingSource.PLATFORM, adminId);
        promotions.save(promotion);
        realtime.promotionChanged("PLATFORM_PROMOTION_CREATED", null, promotion.getCode(), true);
        return PromotionResponse.from(promotion);
    }

    private Promotion build(
            CreatePromotionRequest request,
            PromotionScope scope,
            FundingSource fundingSource,
            UUID creator
    ) {
        return new Promotion(
                request.code(),
                request.name(),
                request.description(),
                scope,
                scope == PromotionScope.HOTEL ? request.hotelId() : null,
                request.discountType(),
                request.discountValue(),
                request.maxDiscount(),
                request.minBookingAmount(),
                request.startAt(),
                request.endAt(),
                request.usageLimit(),
                request.usagePerUser(),
                fundingSource,
                creator
        );
    }

    private void ensureCodeAvailable(String code) {
        if (promotions.findByCodeIgnoreCase(code.trim()).isPresent()) {
            throw new IllegalArgumentException("Mã khuyến mãi đã tồn tại");
        }
    }

    @Transactional(readOnly = true)
    public List<PromotionResponse> mine(UUID userId) {
        return promotions.findAllByCreatedByOrderByCreatedAtDesc(userId)
                .stream()
                .map(PromotionResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PromotionResponse> platform() {
        return promotions.findAllByScopeOrderByCreatedAtDesc(PromotionScope.PLATFORM)
                .stream()
                .map(PromotionResponse::from)
                .toList();
    }

    /** Public hotel-detail list. Only promotions that can still be used right now are returned. */
    @Transactional(readOnly = true)
    public List<PromotionResponse> publicApplicable(UUID hotelId) {
        Instant now = Instant.now();
        return promotions.findAll()
                .stream()
                .filter(promotion -> promotion.usableNow(now))
                .filter(promotion ->
                        promotion.getScope() == PromotionScope.PLATFORM
                                || (
                                promotion.getScope() == PromotionScope.HOTEL
                                        && hotelId != null
                                        && hotelId.equals(promotion.getHotelId())
                        )
                )
                .map(PromotionResponse::from)
                .toList();
    }

    /** Save a promotion into the customer's voucher wallet. */
    @Transactional
    public PromotionResponse save(UUID userId, UUID promotionId) {
        Promotion promotion = promotions.findById(promotionId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy mã ưu đãi"));

        if (!promotion.usableNow(Instant.now())) {
            throw new IllegalArgumentException("Mã ưu đãi hiện không còn khả dụng");
        }

        if (!savedPromotions.existsByPromotionIdAndUserId(promotionId, userId)) {
            savedPromotions.save(new SavedPromotion(promotionId, userId));
        }
        return PromotionResponse.from(promotion);
    }

    @Transactional
    public void unsave(UUID userId, UUID promotionId) {
        savedPromotions.deleteByPromotionIdAndUserId(promotionId, userId);
    }

    @Transactional(readOnly = true)
    public List<PromotionResponse> saved(UUID userId) {
        return savedPromotions.findAllByUserIdOrderBySavedAtDesc(userId)
                .stream()
                .map(item -> promotions.findById(item.getPromotionId()))
                .flatMap(Optional::stream)
                .map(PromotionResponse::from)
                .toList();
    }

    /**
     * Checkout suggestions. They are user-specific so we can hide codes for which the user
     * has already exhausted their personal quota, and amount-specific so minimum-order codes
     * are only shown when they can actually be applied.
     */
    @Transactional(readOnly = true)
    public List<PromotionSuggestionResponse> recommendations(
            UUID userId,
            UUID hotelId,
            BigDecimal amount
    ) {
        BigDecimal gross = money(amount);
        Instant now = Instant.now();
        MembershipProfileResponse membership = memberships.profile(userId);
        BigDecimal afterMembership = gross
                .subtract(percent(gross, membership.discountPercent()))
                .max(BigDecimal.ZERO);

        Set<UUID> savedIds = new HashSet<>();
        for (SavedPromotion saved : savedPromotions.findAllByUserIdOrderBySavedAtDesc(userId)) {
            savedIds.add(saved.getPromotionId());
        }

        Comparator<PromotionSuggestionResponse> ordering = Comparator
                .comparing(PromotionSuggestionResponse::saved)
                .reversed()
                .thenComparing(
                        PromotionSuggestionResponse::estimatedDiscount,
                        Comparator.reverseOrder()
                )
                .thenComparing(item -> item.promotion().endAt());

        return promotions.findAll()
                .stream()
                // Checkout chỉ hiển thị voucher mà chính Customer đã lưu trước đó.
                .filter(promotion -> savedIds.contains(promotion.getId()))
                .filter(promotion -> promotion.usableNow(now))
                .filter(promotion ->
                        promotion.getScope() == PromotionScope.PLATFORM
                                || (
                                promotion.getScope() == PromotionScope.HOTEL
                                        && hotelId != null
                                        && hotelId.equals(promotion.getHotelId())
                        )
                )
                .filter(promotion -> gross.compareTo(promotion.getMinBookingAmount()) >= 0)
                .filter(promotion ->
                        usages.countByPromotionIdAndUserId(promotion.getId(), userId)
                                < promotion.getUsagePerUser()
                )
                .map(promotion -> new PromotionSuggestionResponse(
                        PromotionResponse.from(promotion),
                        true,
                        promotionAmount(promotion, afterMembership)
                ))
                .sorted(ordering)
                .toList();
    }

    @Transactional
    public PromotionResponse setActive(
            UUID id,
            boolean active,
            UUID actor,
            boolean systemAdmin
    ) {
        Promotion promotion = promotions.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy khuyến mãi"));

        if (!systemAdmin && !actor.equals(promotion.getCreatedBy())) {
            throw new IllegalStateException("Bạn không thể thay đổi khuyến mãi này");
        }

        promotion.setActive(active);
        promotions.save(promotion);

        // Status is public information for codes that are displayed to customers.
        realtime.promotionChanged(
                "PROMOTION_STATUS_CHANGED",
                promotion.getHotelId(),
                promotion.getCode(),
                true
        );
        return PromotionResponse.from(promotion);
    }

    @Transactional(readOnly = true)
    public DiscountPlan plan(
            UUID userId,
            UUID hotelId,
            BigDecimal gross,
            String hotelCode,
            String platformCode
    ) {
        BigDecimal subtotal = money(gross);
        MembershipProfileResponse membership = memberships.profile(userId);

        BigDecimal membershipDiscount = percent(subtotal, membership.discountPercent());
        BigDecimal afterMembership = subtotal.subtract(membershipDiscount);

        Promotion hotelPromotion = resolve(
                hotelCode,
                PromotionScope.HOTEL,
                hotelId,
                userId,
                subtotal
        );
        BigDecimal hotelDiscount = promotionAmount(hotelPromotion, afterMembership);
        BigDecimal afterHotel = afterMembership.subtract(hotelDiscount);

        Promotion platformPromotion = resolve(
                platformCode,
                PromotionScope.PLATFORM,
                hotelId,
                userId,
                subtotal
        );
        BigDecimal platformDiscount = promotionAmount(platformPromotion, afterHotel);

        BigDecimal cap = percent(subtotal, BigDecimal.valueOf(30));
        BigDecimal totalDiscount = membershipDiscount
                .add(hotelDiscount)
                .add(platformDiscount);

        if (totalDiscount.compareTo(cap) > 0) {
            BigDecimal over = totalDiscount.subtract(cap);

            BigDecimal cut = platformDiscount.min(over);
            platformDiscount = platformDiscount.subtract(cut);
            over = over.subtract(cut);

            if (over.signum() > 0) {
                cut = hotelDiscount.min(over);
                hotelDiscount = hotelDiscount.subtract(cut);
                over = over.subtract(cut);
            }

            if (over.signum() > 0) {
                membershipDiscount = membershipDiscount.subtract(
                        membershipDiscount.min(over)
                );
            }

            totalDiscount = membershipDiscount
                    .add(hotelDiscount)
                    .add(platformDiscount);
        }

        BigDecimal finalAmount = money(
                subtotal.subtract(totalDiscount).max(BigDecimal.ZERO)
        );

        return new DiscountPlan(
                membership,
                hotelPromotion,
                platformPromotion,
                subtotal,
                money(membershipDiscount),
                money(hotelDiscount),
                money(platformDiscount),
                money(totalDiscount),
                finalAmount,
                cap
        );
    }

    @Transactional(readOnly = true)
    public DiscountPreviewResponse preview(UUID userId, DiscountPreviewRequest request) {
        return plan(
                userId,
                request.hotelId(),
                request.amount(),
                request.hotelPromotionCode(),
                request.platformPromotionCode()
        ).toResponse(userId, request.hotelId());
    }

    private Promotion resolve(
            String code,
            PromotionScope expectedScope,
            UUID hotelId,
            UUID userId,
            BigDecimal gross
    ) {
        if (code == null || code.isBlank()) return null;

        Promotion promotion = promotions.findByCodeIgnoreCase(code.trim())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Mã " + code.trim() + " không tồn tại"
                ));

        if (promotion.getScope() != expectedScope) {
            throw new IllegalArgumentException(
                    expectedScope == PromotionScope.HOTEL
                            ? "Mã này không phải ưu đãi của khách sạn"
                            : "Mã này không phải ưu đãi toàn hệ thống"
            );
        }

        // Voucher Hotel Admin và System Admin đều phải được Customer lưu
        // vào ví voucher trước khi có thể preview hoặc tạo booking với mã đó.
        if (!savedPromotions.existsByPromotionIdAndUserId(promotion.getId(), userId)) {
            throw new IllegalArgumentException(
                    "Bạn chưa lưu mã " + promotion.getCode() + ". Hãy lưu voucher trước khi áp dụng."
            );
        }

        if (
                expectedScope == PromotionScope.HOTEL
                        && !hotelId.equals(promotion.getHotelId())
        ) {
            throw new IllegalArgumentException("Mã không áp dụng cho khách sạn này");
        }

        if (!promotion.usableNow(Instant.now())) {
            throw new IllegalArgumentException(
                    "Mã khuyến mãi chưa đến hạn, đã hết hạn hoặc hết lượt dùng"
            );
        }

        if (gross.compareTo(promotion.getMinBookingAmount()) < 0) {
            throw new IllegalArgumentException(
                    "Booking chưa đạt giá trị tối thiểu để dùng mã " + promotion.getCode()
            );
        }

        if (
                usages.countByPromotionIdAndUserId(promotion.getId(), userId)
                        >= promotion.getUsagePerUser()
        ) {
            throw new IllegalArgumentException(
                    "Bạn đã dùng hết lượt của mã " + promotion.getCode()
            );
        }

        return promotion;
    }

    private BigDecimal promotionAmount(Promotion promotion, BigDecimal base) {
        if (promotion == null) {
            return BigDecimal.ZERO.setScale(2);
        }

        BigDecimal value = promotion.getDiscountType() == DiscountType.PERCENT
                ? percent(base, promotion.getDiscountValue())
                : promotion.getDiscountValue().min(base);

        if (promotion.getMaxDiscount() != null) {
            value = value.min(promotion.getMaxDiscount());
        }

        return money(value.max(BigDecimal.ZERO));
    }

    @Transactional
    public void recordUsage(DiscountPlan plan, UUID userId, UUID bookingGroupId) {
        record(
                plan.hotelPromotion(),
                userId,
                bookingGroupId,
                plan.hotelPromotionDiscount()
        );
        record(
                plan.platformPromotion(),
                userId,
                bookingGroupId,
                plan.platformPromotionDiscount()
        );
    }

    private void record(
            Promotion promotion,
            UUID userId,
            UUID bookingGroupId,
            BigDecimal amount
    ) {
        if (
                promotion == null
                        || amount.signum() <= 0
                        || usages.existsByPromotionIdAndBookingGroupId(
                        promotion.getId(),
                        bookingGroupId
                )
        ) {
            return;
        }

        usages.save(new PromotionUsage(
                promotion.getId(),
                userId,
                bookingGroupId,
                amount
        ));
        promotion.incrementUsage();
        promotions.save(promotion);
    }

    @Transactional
    public CampaignResponse createCampaign(UUID adminId, CreateCampaignRequest request) {
        validateCreationWindow(request.startAt(), request.endAt(), "sự kiện");
        if (request.promotionId() != null) {
            Promotion promotion = promotions.findById(request.promotionId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Không tìm thấy mã khuyến mãi"
                    ));
            if (promotion.getScope() != PromotionScope.PLATFORM) {
                throw new IllegalArgumentException(
                        "Sự kiện toàn hệ thống chỉ gắn với mã nền tảng"
                );
            }
            if (
                    promotion.getStartAt().isAfter(request.startAt())
                            || promotion.getEndAt().isBefore(request.endAt())
            ) {
                throw new IllegalArgumentException(
                        "Thời gian của mã ưu đãi phải bao phủ toàn bộ thời gian sự kiện"
                );
            }
        }

        Campaign campaign = campaigns.save(new Campaign(
                request.name(),
                request.title(),
                request.description(),
                request.badgeText(),
                request.promotionId(),
                request.startAt(),
                request.endAt(),
                adminId
        ));

        realtime.promotionChanged(
                "CAMPAIGN_CREATED",
                null,
                request.promotionId() == null ? "" : request.promotionId().toString(),
                true
        );
        return campaignResponse(campaign);
    }

    @Transactional(readOnly = true)
    public List<CampaignResponse> campaignsAdmin() {
        return campaigns.findAllByOrderByStartAtDesc()
                .stream()
                .map(this::campaignResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CampaignResponse> publicCampaigns() {
        Instant now = Instant.now();
        return campaigns.findAllByOrderByStartAtDesc()
                .stream()
                .filter(campaign -> campaign.visibleNow(now))
                .filter(campaign -> {
                    if (campaign.getPromotionId() == null) return true;
                    return promotions.findById(campaign.getPromotionId())
                            .map(promotion -> promotion.usableNow(now))
                            .orElse(false);
                })
                .map(this::campaignResponse)
                .toList();
    }

    @Transactional
    public CampaignResponse setCampaignActive(UUID id, boolean active) {
        Campaign campaign = campaigns.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy sự kiện"));
        campaign.setActive(active);
        campaigns.save(campaign);
        realtime.promotionChanged("CAMPAIGN_STATUS_CHANGED", null, id.toString(), true);
        return campaignResponse(campaign);
    }

    private CampaignResponse campaignResponse(Campaign campaign) {
        String code = campaign.getPromotionId() == null
                ? null
                : promotions.findById(campaign.getPromotionId())
                .map(Promotion::getCode)
                .orElse(null);
        return CampaignResponse.from(campaign, code);
    }

    private void validateCreationWindow(Instant startAt, Instant endAt, String label) {
        if (startAt == null || endAt == null) {
            throw new IllegalArgumentException("Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc");
        }

        // Chấp nhận sai lệch tối đa 60 giây giữa trình duyệt và server để tránh
        // trường hợp người dùng chọn 'ngay bây giờ' nhưng request đến sau vài giây.
        Instant earliestAllowed = Instant.now().minusSeconds(60);
        if (startAt.isBefore(earliestAllowed)) {
            throw new IllegalArgumentException("Thời gian bắt đầu " + label + " không được ở trong quá khứ");
        }
        if (!endAt.isAfter(startAt)) {
            throw new IllegalArgumentException("Thời gian kết thúc " + label + " phải sau thời gian bắt đầu");
        }
    }

    private static BigDecimal percent(BigDecimal base, BigDecimal percentage) {
        return money(
                base.multiply(percentage)
                        .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
        );
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value)
                .setScale(2, RoundingMode.HALF_UP);
    }

    public record DiscountPlan(
            MembershipProfileResponse membership,
            Promotion hotelPromotion,
            Promotion platformPromotion,
            BigDecimal subtotal,
            BigDecimal membershipDiscount,
            BigDecimal hotelPromotionDiscount,
            BigDecimal platformPromotionDiscount,
            BigDecimal totalDiscount,
            BigDecimal finalAmount,
            BigDecimal cap
    ) {
        public DiscountPreviewResponse toResponse(UUID userId, UUID hotelId) {
            return new DiscountPreviewResponse(
                    userId,
                    hotelId,
                    membership.level(),
                    membership.name(),
                    membership.discountPercent(),
                    subtotal,
                    membershipDiscount,
                    hotelPromotion == null ? null : hotelPromotion.getCode(),
                    hotelPromotionDiscount,
                    platformPromotion == null ? null : platformPromotion.getCode(),
                    platformPromotionDiscount,
                    totalDiscount,
                    finalAmount,
                    cap
            );
        }
    }
}
