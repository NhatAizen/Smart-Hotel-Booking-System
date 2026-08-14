package com.smarthotel.booking.rolechange.fence;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class OwnerDemotionFenceService {

    private final OwnerDemotionFenceRepository repository;

    public OwnerDemotionFenceService(OwnerDemotionFenceRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public OwnerDemotionFenceResponse freeze(
            UUID ownerId,
            UUID transitionId,
            List<UUID> requestedHotelIds
    ) {
        List<UUID> hotelIds = requestedHotelIds.stream().distinct().toList();
        OwnerDemotionFenceRepository.FenceState current = repository.lock(ownerId);
        if (current.frozen() && !transitionId.equals(current.transitionId())) {
            throw new OwnerDemotionFenceException(
                    "Tài khoản đang thuộc một tiến trình hạ quyền khác"
            );
        }
        repository.freeze(ownerId, transitionId, hotelIds);
        return new OwnerDemotionFenceResponse(
                ownerId,
                transitionId,
                true,
                List.copyOf(hotelIds)
        );
    }

    @Transactional
    public void unfreeze(UUID ownerId, UUID transitionId) {
        OwnerDemotionFenceRepository.FenceState current = repository.lock(ownerId);
        if (!current.frozen()) {
            return;
        }
        if (!transitionId.equals(current.transitionId())) {
            throw new OwnerDemotionFenceException(
                    "Không thể mở khóa một tiến trình hạ quyền khác"
            );
        }
        repository.unfreeze(ownerId);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void assertLiabilityCreationAllowed(UUID ownerId) {
        OwnerDemotionFenceRepository.FenceState current = repository.lock(ownerId);
        if (current.frozen()) {
            throw new OwnerDemotionFenceException(
                    "Đối tác đang được chuyển về Customer; không thể tạo booking hoặc giữ phòng mới"
            );
        }
    }
}

