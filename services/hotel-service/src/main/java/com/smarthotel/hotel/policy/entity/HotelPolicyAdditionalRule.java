package com.smarthotel.hotel.policy.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "hotel_policy_additional_rules")
public class HotelPolicyAdditionalRule {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "hotel_id", nullable = false)
    private HotelPolicy policy;

    @Column(name = "title", nullable = false, length = 120)
    private String title;

    @Column(name = "content", nullable = false, length = 1500)
    private String content;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    protected HotelPolicyAdditionalRule() {
    }

    public HotelPolicyAdditionalRule(
            HotelPolicy policy,
            String title,
            String content,
            Integer sortOrder
    ) {
        this.id = UUID.randomUUID();
        this.policy = policy;
        this.title = title;
        this.content = content;
        this.sortOrder = sortOrder;
    }

    public UUID getId() { return id; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public Integer getSortOrder() { return sortOrder; }
}
