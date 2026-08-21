package com.smarthotel.booking.membership.entity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
@Entity @Table(name="membership_tiers")
public class MembershipTier {
 protected MembershipTier(){}
 @Id private Integer level;
 @Column(nullable=false,length=80) private String name;
 @Column(name="min_completed_bookings",nullable=false) private Integer minCompletedBookings;
 @Column(name="discount_percent",nullable=false,precision=5,scale=2) private BigDecimal discountPercent;
 @Column(nullable=false) private boolean active;
 @Column(name="updated_at",nullable=false) private Instant updatedAt;
 public void update(Integer min,BigDecimal pct,boolean active){if(level==1&&min!=0)throw new IllegalArgumentException("Cấp 1 phải bắt đầu từ 0 booking");if(min==null||min<0)throw new IllegalArgumentException("Số booking tối thiểu không hợp lệ");if(pct==null||pct.signum()<0||pct.compareTo(BigDecimal.valueOf(30))>0)throw new IllegalArgumentException("Ưu đãi hạng phải từ 0% đến 30%");this.minCompletedBookings=min;this.discountPercent=pct.setScale(2,RoundingMode.HALF_UP);this.active=active;this.updatedAt=Instant.now();}
 public Integer getLevel(){return level;} public String getName(){return name;} public Integer getMinCompletedBookings(){return minCompletedBookings;} public BigDecimal getDiscountPercent(){return discountPercent;} public boolean isActive(){return active;} public Instant getUpdatedAt(){return updatedAt;}
}
