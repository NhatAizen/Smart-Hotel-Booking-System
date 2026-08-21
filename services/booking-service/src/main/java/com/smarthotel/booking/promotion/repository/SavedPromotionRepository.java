package com.smarthotel.booking.promotion.repository;

import com.smarthotel.booking.promotion.entity.SavedPromotion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SavedPromotionRepository extends JpaRepository<SavedPromotion, UUID> {
    boolean existsByPromotionIdAndUserId(UUID promotionId, UUID userId);
    Optional<SavedPromotion> findByPromotionIdAndUserId(UUID promotionId, UUID userId);
    List<SavedPromotion> findAllByUserIdOrderBySavedAtDesc(UUID userId);
    void deleteByPromotionIdAndUserId(UUID promotionId, UUID userId);
}
