package com.smarthotel.hotel.policy.entity;

import com.smarthotel.hotel.hotel.entity.Hotel;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "hotel_policies")
public class HotelPolicy {

    @Id
    @Column(name = "hotel_id", nullable = false, updatable = false)
    private UUID hotelId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "hotel_id", nullable = false)
    private Hotel hotel;

    @Column(name = "late_checkout_allowed")
    private Boolean lateCheckoutAllowed;

    @Column(name = "late_checkout_details", length = 1000)
    private String lateCheckoutDetails;

    @Column(name = "children_policy", length = 2000)
    private String childrenPolicy;

    @Column(name = "crib_available")
    private Boolean cribAvailable;

    @Column(name = "extra_bed_available")
    private Boolean extraBedAvailable;

    @Column(name = "pets_allowed")
    private Boolean petsAllowed;

    @Column(name = "smoking_allowed")
    private Boolean smokingAllowed;

    @Column(name = "parties_allowed")
    private Boolean partiesAllowed;

    @Column(name = "quiet_hours_from")
    private LocalTime quietHoursFrom;

    @Column(name = "quiet_hours_to")
    private LocalTime quietHoursTo;

    @Column(name = "identity_document_required")
    private Boolean identityDocumentRequired;

    @Column(name = "check_in_instructions", length = 3000)
    private String checkInInstructions;

    @OneToMany(
            mappedBy = "policy",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.EAGER
    )
    @OrderBy("sortOrder ASC")
    private List<HotelPolicyAdditionalRule> additionalRules = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected HotelPolicy() {
    }

    public HotelPolicy(Hotel hotel) {
        this.hotel = hotel;
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(
            Boolean lateCheckoutAllowed,
            String lateCheckoutDetails,
            String childrenPolicy,
            Boolean cribAvailable,
            Boolean extraBedAvailable,
            Boolean petsAllowed,
            Boolean smokingAllowed,
            Boolean partiesAllowed,
            LocalTime quietHoursFrom,
            LocalTime quietHoursTo,
            Boolean identityDocumentRequired,
            String checkInInstructions,
            List<RuleValue> ruleValues
    ) {
        this.lateCheckoutAllowed = lateCheckoutAllowed;
        this.lateCheckoutDetails = clean(lateCheckoutDetails);
        this.childrenPolicy = clean(childrenPolicy);
        this.cribAvailable = cribAvailable;
        this.extraBedAvailable = extraBedAvailable;
        this.petsAllowed = petsAllowed;
        this.smokingAllowed = smokingAllowed;
        this.partiesAllowed = partiesAllowed;
        this.quietHoursFrom = quietHoursFrom;
        this.quietHoursTo = quietHoursTo;
        this.identityDocumentRequired = identityDocumentRequired;
        this.checkInInstructions = clean(checkInInstructions);

        additionalRules.clear();
        if (ruleValues != null) {
            for (int index = 0; index < ruleValues.size(); index++) {
                RuleValue value = ruleValues.get(index);
                additionalRules.add(new HotelPolicyAdditionalRule(
                        this,
                        value.title().trim(),
                        value.content().trim(),
                        index
                ));
            }
        }
        this.updatedAt = Instant.now();
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record RuleValue(String title, String content) {
    }

    public UUID getHotelId() { return hotelId; }
    public Boolean getLateCheckoutAllowed() { return lateCheckoutAllowed; }
    public String getLateCheckoutDetails() { return lateCheckoutDetails; }
    public String getChildrenPolicy() { return childrenPolicy; }
    public Boolean getCribAvailable() { return cribAvailable; }
    public Boolean getExtraBedAvailable() { return extraBedAvailable; }
    public Boolean getPetsAllowed() { return petsAllowed; }
    public Boolean getSmokingAllowed() { return smokingAllowed; }
    public Boolean getPartiesAllowed() { return partiesAllowed; }
    public LocalTime getQuietHoursFrom() { return quietHoursFrom; }
    public LocalTime getQuietHoursTo() { return quietHoursTo; }
    public Boolean getIdentityDocumentRequired() { return identityDocumentRequired; }
    public String getCheckInInstructions() { return checkInInstructions; }
    public List<HotelPolicyAdditionalRule> getAdditionalRules() { return additionalRules; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
