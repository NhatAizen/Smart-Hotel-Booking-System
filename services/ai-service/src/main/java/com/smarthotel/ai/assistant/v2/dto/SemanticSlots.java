package com.smarthotel.ai.assistant.v2.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.util.List;

/** Untrusted interpretation of explicit user constraints; bounded before business use. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SemanticSlots(String city, BigDecimal budget, String budgetScope, Integer adults,
        Integer children, Integer starRating, List<String> amenitiesAdd, List<String> amenitiesRemove,
        Boolean clearBudget, Boolean clearStars, Boolean refundableOnly, Boolean breakfastOnly,
        List<String> unsupportedConstraints, String landmark, Double radiusKm, Boolean clearNearby, String origin) {
    public SemanticSlots(String city,BigDecimal budget,String budgetScope,Integer adults,Integer children,Integer starRating,
            List<String> amenitiesAdd,List<String> amenitiesRemove,Boolean clearBudget,Boolean clearStars,
            Boolean refundableOnly,Boolean breakfastOnly,List<String> unsupportedConstraints,String landmark,Double radiusKm,Boolean clearNearby) {
        this(city,budget,budgetScope,adults,children,starRating,amenitiesAdd,amenitiesRemove,clearBudget,clearStars,
                refundableOnly,breakfastOnly,unsupportedConstraints,landmark,radiusKm,clearNearby,null);
    }
    public SemanticSlots(String city, BigDecimal budget, String budgetScope, Integer adults, Integer children,
            Integer starRating, List<String> amenitiesAdd, List<String> amenitiesRemove, Boolean clearBudget,
            Boolean clearStars, Boolean refundableOnly, Boolean breakfastOnly, List<String> unsupportedConstraints) {
        this(city,budget,budgetScope,adults,children,starRating,amenitiesAdd,amenitiesRemove,clearBudget,clearStars,
                refundableOnly,breakfastOnly,unsupportedConstraints,null,null,null);
    }
}
