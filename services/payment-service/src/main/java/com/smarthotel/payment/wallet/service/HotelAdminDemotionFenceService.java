package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.wallet.entity.HotelAdminDemotionFence;
import com.smarthotel.payment.wallet.exception.HotelAdminDemotionFenceException;
import com.smarthotel.payment.wallet.repository.HotelAdminDemotionFenceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.UUID;

@Service
public class HotelAdminDemotionFenceService {

    private final HotelAdminDemotionFenceRepository repository;

    public HotelAdminDemotionFenceService(HotelAdminDemotionFenceRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void acquire(UUID ownerId, UUID transitionId) {
        requireId(ownerId, "ownerId");
        requireId(transitionId, "transitionId");

        HotelAdminDemotionFence fence = lockOwner(ownerId);
        UUID activeTransitionId = fence.getTransitionId();
        if (activeTransitionId != null && !activeTransitionId.equals(transitionId)) {
            throw new HotelAdminDemotionFenceException(
                    "Tài khoản đang được xử lý bởi một yêu cầu ngừng làm đối tác khác"
            );
        }
        if (activeTransitionId == null) {
            fence.activate(transitionId);
        }
    }

    @Transactional
    public void release(UUID ownerId, UUID transitionId) {
        requireId(ownerId, "ownerId");
        requireId(transitionId, "transitionId");

        HotelAdminDemotionFence fence = lockOwner(ownerId);
        UUID activeTransitionId = fence.getTransitionId();
        if (activeTransitionId == null) {
            return;
        }
        if (!activeTransitionId.equals(transitionId)) {
            throw new HotelAdminDemotionFenceException(
                    "Không thể gỡ khóa của một yêu cầu ngừng làm đối tác khác"
            );
        }
        fence.deactivate();
    }

    /**
     * Joins the caller transaction. The pessimistic row lock is therefore held
     * until the protected financial mutation commits or rolls back.
     */
    @Transactional
    public void ensureOwnerMutationAllowed(UUID ownerId) {
        requireId(ownerId, "ownerId");
        HotelAdminDemotionFence fence = lockOwner(ownerId);
        if (fence.getTransitionId() != null) {
            throw new HotelAdminDemotionFenceException(
                    "Tài khoản đang chuyển về Customer nên không thể phát sinh giao dịch tài chính mới"
            );
        }
    }

    private HotelAdminDemotionFence lockOwner(UUID ownerId) {
        repository.ensureOwnerRow(ownerId);
        return repository.findForUpdate(ownerId)
                .orElseThrow(() -> new IllegalStateException(
                        "Không thể tạo khóa giao dịch tài chính cho tài khoản " + ownerId
                ));
    }

    private void requireId(UUID value, String field) {
        if (Objects.isNull(value)) {
            throw new IllegalArgumentException(field + " không được để trống");
        }
    }
}
