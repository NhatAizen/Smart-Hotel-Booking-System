package com.smarthotel.booking.promotion.repository;
import com.smarthotel.booking.promotion.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface PromotionRepository extends JpaRepository<Promotion,UUID>{
 Optional<Promotion> findByCodeIgnoreCase(String code);
 List<Promotion> findAllByCreatedByOrderByCreatedAtDesc(UUID createdBy);
 List<Promotion> findAllByScopeOrderByCreatedAtDesc(PromotionScope scope);
}
