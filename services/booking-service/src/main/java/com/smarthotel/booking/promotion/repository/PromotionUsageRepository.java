package com.smarthotel.booking.promotion.repository;
import com.smarthotel.booking.promotion.entity.PromotionUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface PromotionUsageRepository extends JpaRepository<PromotionUsage,UUID>{
 long countByPromotionIdAndUserId(UUID promotionId,UUID userId);
 boolean existsByPromotionIdAndBookingGroupId(UUID promotionId,UUID bookingGroupId);
}
