package com.smarthotel.hotel.hotel.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalTime;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "hotels")
public class Hotel {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "address", nullable = false, length = 255)
    private String address;

    @Column(name = "ward", length = 100)
    private String ward;

    @Column(name = "district", length = 100)
    private String district;

    @Column(name = "city", nullable = false, length = 100)
    private String city;

    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;

    @Column(name = "geocoding_attempted_at")
    private Instant geocodingAttemptedAt;

    @Column(name = "geocoded_at")
    private Instant geocodedAt;

    @Column(name = "geocoded_address", length = 500)
    private String geocodedAddress;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "email", length = 150)
    private String email;

    @Column(name = "star_rating", nullable = false)
    private Integer starRating;

    @Column(name = "check_in_time")
    private LocalTime checkInTime;

    @Column(name = "check_out_time")
    private LocalTime checkOutTime;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "hotel_amenities",
            joinColumns = @JoinColumn(name = "hotel_id")
    )
    @Column(name = "amenity", nullable = false, length = 100)
    private Set<String> amenities = new LinkedHashSet<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private HotelStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "approval_status", nullable = false, length = 30)
    private HotelApprovalStatus approvalStatus;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Hotel() {
    }

    public Hotel(
            UUID ownerId,
            String name,
            String description,
            String address,
            String ward,
            String district,
            String city,
            Double latitude,
            Double longitude,
            String phone,
            String email,
            Integer starRating,
            LocalTime checkInTime,
            LocalTime checkOutTime,
            Set<String> amenities
    ) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        applyDetails(
                name, description, address, ward, district, city,
                phone, email, starRating, checkInTime, checkOutTime, amenities
        );
        if (latitude != null && longitude != null) {
            applyGeocodingSuccess(latitude, longitude, null);
        } else {
            resetGeocoding();
        }
        this.status = HotelStatus.ACTIVE;
        this.approvalStatus = HotelApprovalStatus.DRAFT;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(
            String name,
            String description,
            String address,
            String ward,
            String district,
            String city,
            Double latitude,
            Double longitude,
            String phone,
            String email,
            Integer starRating,
            LocalTime checkInTime,
            LocalTime checkOutTime,
            Set<String> amenities,
            HotelStatus status
    ) {
        applyDetails(
                name, description, address, ward, district, city,
                phone, email, starRating, checkInTime, checkOutTime, amenities
        );
        if (latitude != null && longitude != null) {
            applyGeocodingSuccess(latitude, longitude, null);
        } else {
            resetGeocoding();
        }
        this.status = status;

        if (approvalStatus == HotelApprovalStatus.REJECTED) {
            approvalStatus = HotelApprovalStatus.DRAFT;
            clearReview();
        }

        updatedAt = Instant.now();
    }

    public void submitForApproval() {
        if (approvalStatus != HotelApprovalStatus.DRAFT
                && approvalStatus != HotelApprovalStatus.REJECTED) {
            throw new IllegalStateException(
                    "Chỉ hồ sơ nháp hoặc bị từ chối mới được gửi duyệt"
            );
        }

        approvalStatus = HotelApprovalStatus.PENDING;
        clearReview();
        updatedAt = Instant.now();
    }

    public void approve(UUID systemAdminId) {
        ensurePending();
        approvalStatus = HotelApprovalStatus.APPROVED;
        rejectionReason = null;
        reviewedBy = systemAdminId;
        reviewedAt = Instant.now();
        updatedAt = Instant.now();
    }

    public void reject(UUID systemAdminId, String reason) {
        ensurePending();
        approvalStatus = HotelApprovalStatus.REJECTED;
        rejectionReason = reason;
        reviewedBy = systemAdminId;
        reviewedAt = Instant.now();
        updatedAt = Instant.now();
    }

    public void deactivate() {
        status = HotelStatus.INACTIVE;
        updatedAt = Instant.now();
    }

    public void updateStayTimes(LocalTime checkInTime, LocalTime checkOutTime) {
        this.checkInTime = checkInTime;
        this.checkOutTime = checkOutTime;
        this.updatedAt = Instant.now();
    }

    private void applyDetails(
            String name,
            String description,
            String address,
            String ward,
            String district,
            String city,
            String phone,
            String email,
            Integer starRating,
            LocalTime checkInTime,
            LocalTime checkOutTime,
            Set<String> amenities
    ) {
        this.name = name;
        this.description = description;
        this.address = address;
        this.ward = ward;
        this.district = district;
        this.city = city;
        this.phone = phone;
        this.email = email;
        this.starRating = starRating == null ? 0 : starRating;
        this.checkInTime = checkInTime;
        this.checkOutTime = checkOutTime;
        this.amenities.clear();
        if (amenities != null) {
            this.amenities.addAll(amenities);
        }
    }

    public void applyGeocodingSuccess(
            Double latitude,
            Double longitude,
            String geocodedAddress
    ) {
        setCoordinates(latitude, longitude);
        Instant now = Instant.now();
        this.geocodingAttemptedAt = now;
        this.geocodedAt = now;
        this.geocodedAddress = geocodedAddress;
    }

    public void markGeocodingNotFound() {
        setCoordinates(null, null);
        this.geocodingAttemptedAt = Instant.now();
        this.geocodedAt = null;
        this.geocodedAddress = null;
    }

    public void resetGeocoding() {
        setCoordinates(null, null);
        this.geocodingAttemptedAt = null;
        this.geocodedAt = null;
        this.geocodedAddress = null;
    }

    private void setCoordinates(Double latitude, Double longitude) {
        if (latitude == null || longitude == null) {
            this.latitude = null;
            this.longitude = null;
            return;
        }

        if (latitude < -90 || latitude > 90) {
            throw new IllegalArgumentException("Vĩ độ phải nằm trong khoảng -90 đến 90");
        }
        if (longitude < -180 || longitude > 180) {
            throw new IllegalArgumentException("Kinh độ phải nằm trong khoảng -180 đến 180");
        }

        this.latitude = latitude;
        this.longitude = longitude;
    }

    private void clearReview() {
        rejectionReason = null;
        reviewedBy = null;
        reviewedAt = null;
    }

    private void ensurePending() {
        if (approvalStatus != HotelApprovalStatus.PENDING) {
            throw new IllegalStateException(
                    "Chỉ khách sạn chờ duyệt mới được xử lý"
            );
        }
    }

    public UUID getId() { return id; }
    public UUID getOwnerId() { return ownerId; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public String getAddress() { return address; }
    public String getWard() { return ward; }
    public String getDistrict() { return district; }
    public String getCity() { return city; }
    public Double getLatitude() { return latitude; }
    public Double getLongitude() { return longitude; }
    public Instant getGeocodingAttemptedAt() { return geocodingAttemptedAt; }
    public Instant getGeocodedAt() { return geocodedAt; }
    public String getGeocodedAddress() { return geocodedAddress; }
    public String getPhone() { return phone; }
    public String getEmail() { return email; }
    public Integer getStarRating() { return starRating; }
    public LocalTime getCheckInTime() { return checkInTime; }
    public LocalTime getCheckOutTime() { return checkOutTime; }
    public Set<String> getAmenities() { return amenities; }
    public HotelStatus getStatus() { return status; }
    public HotelApprovalStatus getApprovalStatus() { return approvalStatus; }
    public String getRejectionReason() { return rejectionReason; }
    public UUID getReviewedBy() { return reviewedBy; }
    public Instant getReviewedAt() { return reviewedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
