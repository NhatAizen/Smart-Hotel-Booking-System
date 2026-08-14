package com.smarthotel.booking.pricing.repository;

import com.smarthotel.booking.pricing.entity.SpecialPricingDate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface SpecialPricingDateRepository extends JpaRepository<SpecialPricingDate, UUID> {
    List<SpecialPricingDate> findAllByPricingDateBetweenAndActiveTrue(LocalDate from, LocalDate to);
}
