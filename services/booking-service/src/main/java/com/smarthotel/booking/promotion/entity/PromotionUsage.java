package com.smarthotel.booking.promotion.entity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="promotion_usages")
public class PromotionUsage {
 protected PromotionUsage(){}
 @Id private UUID id;
 @Column(name="promotion_id",nullable=false) private UUID promotionId;
 @Column(name="user_id",nullable=false) private UUID userId;
 @Column(name="booking_group_id",nullable=false) private UUID bookingGroupId;
 @Column(name="discount_amount",nullable=false,precision=14,scale=2) private BigDecimal discountAmount;
 @Column(name="used_at",nullable=false) private Instant usedAt;
 public PromotionUsage(UUID promotionId,UUID userId,UUID bookingGroupId,BigDecimal discountAmount){this.id=UUID.randomUUID();this.promotionId=promotionId;this.userId=userId;this.bookingGroupId=bookingGroupId;this.discountAmount=discountAmount;this.usedAt=Instant.now();}
}
