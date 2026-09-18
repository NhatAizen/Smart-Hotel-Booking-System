package com.smarthotel.hotel.policy.service;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.policy.dto.HotelPolicyResponse;
import com.smarthotel.hotel.policy.dto.UpdateHotelPolicyRequest;
import com.smarthotel.hotel.policy.entity.HotelPolicy;
import com.smarthotel.hotel.policy.repository.HotelPolicyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class HotelPolicyService {

    private final HotelPolicyRepository policyRepository;
    private final HotelService hotelService;

    public HotelPolicyService(
            HotelPolicyRepository policyRepository,
            HotelService hotelService
    ) {
        this.policyRepository = policyRepository;
        this.hotelService = hotelService;
    }

    @Transactional(readOnly = true)
    public HotelPolicyResponse getPublic(UUID hotelId) {
        hotelService.getPublicById(hotelId);
        Hotel hotel = hotelService.findHotel(hotelId);
        return response(hotel);
    }

    @Transactional(readOnly = true)
    public HotelPolicyResponse getOwned(UUID ownerId, UUID hotelId) {
        return response(hotelService.getOwnedHotel(hotelId, ownerId));
    }

    @Transactional
    public HotelPolicyResponse updateOwned(
            UUID ownerId,
            UUID hotelId,
            UpdateHotelPolicyRequest request
    ) {
        Hotel hotel = hotelService.getOwnedHotel(hotelId, ownerId);
        HotelPolicy policy = policyRepository.findById(hotelId)
                .orElseGet(() -> new HotelPolicy(hotel));
        hotel.updateStayTimes(request.checkInTime(), request.checkOutTime());

        List<HotelPolicy.RuleValue> rules = request.additionalRules() == null
                ? List.of()
                : request.additionalRules().stream()
                .map(rule -> new HotelPolicy.RuleValue(rule.title(), rule.content()))
                .toList();

        policy.update(
                request.lateCheckoutAllowed(), request.lateCheckoutDetails(),
                request.childrenPolicy(), request.cribAvailable(),
                request.extraBedAvailable(), request.petsAllowed(),
                request.smokingAllowed(), request.partiesAllowed(),
                request.quietHoursFrom(), request.quietHoursTo(),
                request.identityDocumentRequired(), request.checkInInstructions(), rules
        );
        return HotelPolicyResponse.from(hotel, policyRepository.save(policy));
    }

    private HotelPolicyResponse response(Hotel hotel) {
        return policyRepository.findById(hotel.getId())
                .map(policy -> HotelPolicyResponse.from(hotel, policy))
                .orElseGet(() -> HotelPolicyResponse.empty(hotel));
    }
}
