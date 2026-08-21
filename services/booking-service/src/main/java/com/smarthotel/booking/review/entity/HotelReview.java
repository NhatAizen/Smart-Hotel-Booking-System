package com.smarthotel.booking.review.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "hotel_reviews")
public class HotelReview {

    public static final String MODERATION_VISIBLE = "VISIBLE";
    public static final String MODERATION_HIDDEN = "HIDDEN";

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "booking_id", nullable = false, unique = true)
    private UUID bookingId;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "customer_name", nullable = false, length = 150)
    private String customerName;

    @Column(name = "hotel_id", nullable = false)
    private UUID hotelId;

    @Column(name = "room_type_id")
    private UUID roomTypeId;

    @Column(name = "check_in")
    private LocalDate checkIn;

    @Column(name = "check_out")
    private LocalDate checkOut;

    @Column(name = "adults")
    private Integer adults;

    @Column(name = "children")
    private Integer children;

    @Column(name = "trip_type", nullable = false, length = 24)
    private String tripType;

    @Column(name = "review_language", nullable = false, length = 12)
    private String reviewLanguage;

    @Column(name = "rating", nullable = false)
    private Integer rating;

    @Column(name = "staff_rating", nullable = false)
    private Integer staffRating;

    @Column(name = "facilities_rating", nullable = false)
    private Integer facilitiesRating;

    @Column(name = "cleanliness_rating", nullable = false)
    private Integer cleanlinessRating;

    @Column(name = "comfort_rating", nullable = false)
    private Integer comfortRating;

    @Column(name = "value_rating", nullable = false)
    private Integer valueRating;

    @Column(name = "location_rating", nullable = false)
    private Integer locationRating;

    @Column(name = "wifi_rating")
    private Integer wifiRating;

    @Column(name = "title", length = 180)
    private String title;

    // Giữ cột comment cũ để tương thích dữ liệu và migration trước.
    @Column(name = "comment", nullable = false, columnDefinition = "TEXT")
    private String comment;

    @Column(name = "positive_comment", nullable = false, columnDefinition = "TEXT")
    private String positiveComment;

    @Column(name = "negative_comment", columnDefinition = "TEXT")
    private String negativeComment;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "hotel_review_images",
            joinColumns = @JoinColumn(name = "review_id")
    )
    @OrderColumn(name = "sort_order")
    @Column(name = "image_url", nullable = false, length = 1000)
    private List<String> imageUrls = new ArrayList<>();

    @Column(name = "hotel_reply", columnDefinition = "TEXT")
    private String hotelReply;

    @Column(name = "hotel_reply_at")
    private Instant hotelReplyAt;

    @Column(name = "hotel_reply_by")
    private UUID hotelReplyBy;

    @Column(name = "moderation_status", nullable = false, length = 16)
    private String moderationStatus;

    @Column(name = "hidden_reason", columnDefinition = "TEXT")
    private String hiddenReason;

    @Column(name = "hidden_at")
    private Instant hiddenAt;

    @Column(name = "hidden_by")
    private UUID hiddenBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected HotelReview() {
    }

    public HotelReview(
            UUID bookingId,
            UUID customerId,
            String customerName,
            UUID hotelId,
            UUID roomTypeId,
            LocalDate checkIn,
            LocalDate checkOut,
            Integer adults,
            Integer children,
            String tripType,
            Integer rating,
            Integer staffRating,
            Integer facilitiesRating,
            Integer cleanlinessRating,
            Integer comfortRating,
            Integer valueRating,
            Integer locationRating,
            Integer wifiRating,
            String title,
            String positiveComment,
            String negativeComment,
            List<String> imageUrls
    ) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.bookingId = bookingId;
        this.customerId = customerId;
        this.customerName = customerName;
        this.hotelId = hotelId;
        this.roomTypeId = roomTypeId;
        this.checkIn = checkIn;
        this.checkOut = checkOut;
        this.adults = adults;
        this.children = children;
        this.tripType = tripType;
        this.reviewLanguage = "vi";
        this.rating = rating;
        this.staffRating = staffRating;
        this.facilitiesRating = facilitiesRating;
        this.cleanlinessRating = cleanlinessRating;
        this.comfortRating = comfortRating;
        this.valueRating = valueRating;
        this.locationRating = locationRating;
        this.wifiRating = wifiRating;
        this.title = title;
        this.positiveComment = positiveComment;
        this.comment = positiveComment;
        this.negativeComment = negativeComment;
        this.imageUrls = imageUrls == null ? new ArrayList<>() : new ArrayList<>(imageUrls);
        this.moderationStatus = MODERATION_VISIBLE;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void createHotelReply(UUID hotelAdminId, String content) {
        if (hasHotelReply()) {
            throw new IllegalStateException("Đánh giá này đã có phản hồi từ khách sạn");
        }
        setHotelReply(hotelAdminId, content);
    }

    public void updateHotelReply(UUID hotelAdminId, String content) {
        if (!hasHotelReply()) {
            throw new IllegalStateException("Đánh giá này chưa có phản hồi để cập nhật");
        }
        setHotelReply(hotelAdminId, content);
    }

    public void deleteHotelReply() {
        if (!hasHotelReply()) {
            throw new IllegalStateException("Đánh giá này chưa có phản hồi để xóa");
        }
        this.hotelReply = null;
        this.hotelReplyAt = null;
        this.hotelReplyBy = null;
        this.updatedAt = Instant.now();
    }

    public void hide(UUID systemAdminId, String reason) {
        if (isHidden()) {
            throw new IllegalStateException("Đánh giá này đã bị ẩn");
        }
        Instant now = Instant.now();
        this.moderationStatus = MODERATION_HIDDEN;
        this.hiddenReason = reason;
        this.hiddenAt = now;
        this.hiddenBy = systemAdminId;
        this.updatedAt = now;
    }

    public void restore() {
        if (!isHidden()) {
            throw new IllegalStateException("Đánh giá này đang hiển thị");
        }
        this.moderationStatus = MODERATION_VISIBLE;
        this.hiddenReason = null;
        this.hiddenAt = null;
        this.hiddenBy = null;
        this.updatedAt = Instant.now();
    }

    public boolean isHidden() {
        return MODERATION_HIDDEN.equalsIgnoreCase(moderationStatus);
    }

    public boolean hasHotelReply() {
        return hotelReply != null && !hotelReply.isBlank();
    }

    private void setHotelReply(UUID hotelAdminId, String content) {
        Instant now = Instant.now();
        this.hotelReply = content;
        this.hotelReplyAt = now;
        this.hotelReplyBy = hotelAdminId;
        this.updatedAt = now;
    }

    public UUID getId() { return id; }
    public UUID getBookingId() { return bookingId; }
    public UUID getCustomerId() { return customerId; }
    public String getCustomerName() { return customerName; }
    public UUID getHotelId() { return hotelId; }
    public UUID getRoomTypeId() { return roomTypeId; }
    public LocalDate getCheckIn() { return checkIn; }
    public LocalDate getCheckOut() { return checkOut; }
    public Integer getAdults() { return adults; }
    public Integer getChildren() { return children; }
    public String getTripType() { return tripType; }
    public String getReviewLanguage() { return reviewLanguage; }
    public Integer getRating() { return rating; }
    public Integer getStaffRating() { return staffRating; }
    public Integer getFacilitiesRating() { return facilitiesRating; }
    public Integer getCleanlinessRating() { return cleanlinessRating; }
    public Integer getComfortRating() { return comfortRating; }
    public Integer getValueRating() { return valueRating; }
    public Integer getLocationRating() { return locationRating; }
    public Integer getWifiRating() { return wifiRating; }
    public String getTitle() { return title; }
    public String getComment() { return comment; }
    public String getPositiveComment() { return positiveComment; }
    public String getNegativeComment() { return negativeComment; }
    public List<String> getImageUrls() { return imageUrls; }
    public String getHotelReply() { return hotelReply; }
    public Instant getHotelReplyAt() { return hotelReplyAt; }
    public UUID getHotelReplyBy() { return hotelReplyBy; }
    public String getModerationStatus() { return moderationStatus; }
    public String getHiddenReason() { return hiddenReason; }
    public Instant getHiddenAt() { return hiddenAt; }
    public UUID getHiddenBy() { return hiddenBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
