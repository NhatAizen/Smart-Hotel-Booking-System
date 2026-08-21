package com.smarthotel.booking.membership.service;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.membership.dto.*;import com.smarthotel.booking.membership.entity.MembershipTier;import com.smarthotel.booking.membership.repository.MembershipTierRepository;
import org.springframework.stereotype.Service;import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;import java.util.*;
@Service
public class MembershipService {
 private final MembershipTierRepository tierRepository; private final BookingRepository bookingRepository;
 public MembershipService(MembershipTierRepository t,BookingRepository b){tierRepository=t;bookingRepository=b;}
 @Transactional(readOnly=true) public MembershipProfileResponse profile(UUID customerId){long completed=bookingRepository.countCompletedBookingGroups(customerId);List<MembershipTier> tiers=tierRepository.findAllByActiveTrueOrderByMinCompletedBookingsAsc();if(tiers.isEmpty())throw new IllegalStateException("Chưa cấu hình hạng thành viên");MembershipTier current=tiers.get(0),next=null;for(MembershipTier tier:tiers){if(completed>=tier.getMinCompletedBookings())current=tier;else{next=tier;break;}}return new MembershipProfileResponse(current.getLevel(),current.getName(),completed,current.getDiscountPercent(),next==null?null:next.getLevel(),next==null?null:next.getName(),next==null?null:Math.max(0,next.getMinCompletedBookings()-(int)completed));}
 @Transactional(readOnly=true) public List<MembershipTierResponse> tiers(){return tierRepository.findAllByOrderByLevelAsc().stream().map(MembershipTierResponse::from).toList();}
 @Transactional public MembershipTierResponse update(Integer level,UpdateMembershipTierRequest req){MembershipTier tier=tierRepository.findById(level).orElseThrow(()->new IllegalArgumentException("Không tìm thấy cấp thành viên"));tier.update(req.minCompletedBookings(),req.discountPercent(),req.active());tierRepository.save(tier);validateOrdering();return MembershipTierResponse.from(tier);}
 private void validateOrdering(){List<MembershipTier> all=tierRepository.findAllByOrderByLevelAsc();int prev=-1;for(MembershipTier t:all){if(t.getMinCompletedBookings()<=prev)throw new IllegalArgumentException("Mốc booking của các cấp phải tăng dần");prev=t.getMinCompletedBookings();}}
}
