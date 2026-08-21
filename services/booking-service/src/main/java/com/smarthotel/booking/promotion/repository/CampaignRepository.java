package com.smarthotel.booking.promotion.repository;
import com.smarthotel.booking.promotion.entity.Campaign;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface CampaignRepository extends JpaRepository<Campaign,UUID>{List<Campaign> findAllByOrderByStartAtDesc();}
