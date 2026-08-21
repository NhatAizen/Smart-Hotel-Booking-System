package com.smarthotel.booking.promotion.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name="promotions")
public class Promotion {
    protected Promotion() {}
    @Id @Column(nullable=false, updatable=false) private UUID id;
    @Column(nullable=false, unique=true, length=40) private String code;
    @Column(nullable=false, length=160) private String name;
    @Column(length=600) private String description;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=20) private PromotionScope scope;
    @Column(name="hotel_id") private UUID hotelId;
    @Enumerated(EnumType.STRING) @Column(name="discount_type", nullable=false, length=20) private DiscountType discountType;
    @Column(name="discount_value", nullable=false, precision=14, scale=2) private BigDecimal discountValue;
    @Column(name="max_discount", precision=14, scale=2) private BigDecimal maxDiscount;
    @Column(name="min_booking_amount", nullable=false, precision=14, scale=2) private BigDecimal minBookingAmount;
    @Column(name="start_at", nullable=false) private Instant startAt;
    @Column(name="end_at", nullable=false) private Instant endAt;
    @Column(name="usage_limit") private Integer usageLimit;
    @Column(name="usage_per_user", nullable=false) private Integer usagePerUser;
    @Column(name="used_count", nullable=false) private Integer usedCount;
    @Column(nullable=false) private boolean active;
    @Enumerated(EnumType.STRING) @Column(name="funding_source", nullable=false, length=20) private FundingSource fundingSource;
    @Column(name="created_by", nullable=false) private UUID createdBy;
    @Column(name="created_at", nullable=false, updatable=false) private Instant createdAt;
    @Column(name="updated_at", nullable=false) private Instant updatedAt;

    public Promotion(String code, String name, String description, PromotionScope scope, UUID hotelId,
                     DiscountType discountType, BigDecimal discountValue, BigDecimal maxDiscount,
                     BigDecimal minBookingAmount, Instant startAt, Instant endAt, Integer usageLimit,
                     Integer usagePerUser, FundingSource fundingSource, UUID createdBy) {
        if (startAt == null || endAt == null || !endAt.isAfter(startAt)) throw new IllegalArgumentException("Thời gian khuyến mãi không hợp lệ");
        this.id=UUID.randomUUID(); this.code=normalizeCode(code); this.name=require(name,"Tên khuyến mãi");
        this.description=trim(description); this.scope=scope; this.hotelId=hotelId; this.discountType=discountType;
        this.discountValue=money(discountValue); this.maxDiscount=maxDiscount==null?null:money(maxDiscount);
        this.minBookingAmount=money(minBookingAmount==null?BigDecimal.ZERO:minBookingAmount);
        this.startAt=startAt; this.endAt=endAt; this.usageLimit=usageLimit; this.usagePerUser=usagePerUser==null?1:Math.max(1,usagePerUser);
        this.usedCount=0; this.active=true; this.fundingSource=fundingSource; this.createdBy=createdBy;
        this.createdAt=Instant.now(); this.updatedAt=this.createdAt;
        validate();
    }
    private void validate(){
        if(scope==PromotionScope.HOTEL && hotelId==null) throw new IllegalArgumentException("Khuyến mãi khách sạn phải chọn khách sạn");
        if(scope==PromotionScope.PLATFORM) hotelId=null;
        if(discountValue.signum()<=0) throw new IllegalArgumentException("Mức giảm phải lớn hơn 0");
        if(discountType==DiscountType.PERCENT && discountValue.compareTo(BigDecimal.valueOf(100))>0) throw new IllegalArgumentException("Mức giảm phần trăm không được vượt 100%");
        if(usageLimit!=null && usageLimit<1) throw new IllegalArgumentException("Giới hạn lượt dùng phải lớn hơn 0");
    }
    public void setActive(boolean value){this.active=value;this.updatedAt=Instant.now();}
    public void incrementUsage(){this.usedCount=this.usedCount+1;this.updatedAt=Instant.now();}
    public boolean usableNow(Instant now){return active && !now.isBefore(startAt) && now.isBefore(endAt) && (usageLimit==null || usedCount<usageLimit);}
    private static String normalizeCode(String s){String v=require(s,"Mã khuyến mãi").toUpperCase(Locale.ROOT).replaceAll("\s+",""); if(!v.matches("[A-Z0-9_-]{3,40}")) throw new IllegalArgumentException("Mã khuyến mãi chỉ gồm chữ, số, _ hoặc -"); return v;}
    private static String require(String s,String field){String v=trim(s);if(v==null||v.isBlank()) throw new IllegalArgumentException(field+" không được để trống");return v;}
    private static String trim(String s){return s==null?null:s.trim();}
    private static BigDecimal money(BigDecimal v){return (v==null?BigDecimal.ZERO:v).setScale(2,RoundingMode.HALF_UP);}
    public UUID getId(){return id;} public String getCode(){return code;} public String getName(){return name;} public String getDescription(){return description;} public PromotionScope getScope(){return scope;} public UUID getHotelId(){return hotelId;} public DiscountType getDiscountType(){return discountType;} public BigDecimal getDiscountValue(){return discountValue;} public BigDecimal getMaxDiscount(){return maxDiscount;} public BigDecimal getMinBookingAmount(){return minBookingAmount;} public Instant getStartAt(){return startAt;} public Instant getEndAt(){return endAt;} public Integer getUsageLimit(){return usageLimit;} public Integer getUsagePerUser(){return usagePerUser;} public Integer getUsedCount(){return usedCount;} public boolean isActive(){return active;} public FundingSource getFundingSource(){return fundingSource;} public UUID getCreatedBy(){return createdBy;} public Instant getCreatedAt(){return createdAt;} public Instant getUpdatedAt(){return updatedAt;}
}
