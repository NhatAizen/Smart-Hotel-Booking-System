package com.smarthotel.hotel.policy.repository;

import com.smarthotel.hotel.policy.entity.HotelPolicy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface HotelPolicyRepository extends JpaRepository<HotelPolicy, UUID> {
}
