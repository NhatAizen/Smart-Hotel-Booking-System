package com.smarthotel.booking.membership.repository;
import com.smarthotel.booking.membership.entity.MembershipTier;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface MembershipTierRepository extends JpaRepository<MembershipTier,Integer>{List<MembershipTier> findAllByActiveTrueOrderByMinCompletedBookingsAsc(); List<MembershipTier> findAllByOrderByLevelAsc();}
