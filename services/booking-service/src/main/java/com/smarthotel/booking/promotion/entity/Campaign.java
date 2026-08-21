package com.smarthotel.booking.promotion.entity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="campaigns")
public class Campaign {
 protected Campaign(){}
 @Id private UUID id;
 @Column(nullable=false,length=160) private String name;
 @Column(nullable=false,length=220) private String title;
 @Column(length=800) private String description;
 @Column(name="badge_text",length=80) private String badgeText;
 @Column(name="promotion_id") private UUID promotionId;
 @Column(name="start_at",nullable=false) private Instant startAt;
 @Column(name="end_at",nullable=false) private Instant endAt;
 @Column(nullable=false) private boolean active;
 @Column(name="created_by",nullable=false) private UUID createdBy;
 @Column(name="created_at",nullable=false) private Instant createdAt;
 public Campaign(String name,String title,String description,String badgeText,UUID promotionId,Instant startAt,Instant endAt,UUID createdBy){if(startAt==null||endAt==null||!endAt.isAfter(startAt))throw new IllegalArgumentException("Thời gian sự kiện không hợp lệ");this.id=UUID.randomUUID();this.name=req(name);this.title=req(title);this.description=trim(description);this.badgeText=trim(badgeText);this.promotionId=promotionId;this.startAt=startAt;this.endAt=endAt;this.active=true;this.createdBy=createdBy;this.createdAt=Instant.now();}
 public void setActive(boolean v){active=v;} public boolean visibleNow(Instant now){return active&&!now.isBefore(startAt)&&now.isBefore(endAt);}
 private static String req(String s){String v=trim(s);if(v==null||v.isBlank())throw new IllegalArgumentException("Tên sự kiện không được để trống");return v;} private static String trim(String s){return s==null?null:s.trim();}
 public UUID getId(){return id;} public String getName(){return name;} public String getTitle(){return title;} public String getDescription(){return description;} public String getBadgeText(){return badgeText;} public UUID getPromotionId(){return promotionId;} public Instant getStartAt(){return startAt;} public Instant getEndAt(){return endAt;} public boolean isActive(){return active;} public UUID getCreatedBy(){return createdBy;} public Instant getCreatedAt(){return createdAt;}
}
