package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.wallet.entity.HotelAdminDemotionFence;
import com.smarthotel.payment.wallet.exception.HotelAdminDemotionFenceException;
import com.smarthotel.payment.wallet.repository.HotelAdminDemotionFenceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HotelAdminDemotionFenceServiceTest {

    @Mock
    HotelAdminDemotionFenceRepository repository;

    @Test
    void acquireEnsuresSentinelBeforeLockingAndIsIdempotentForSameTransition() {
        UUID ownerId = UUID.randomUUID();
        UUID transitionId = UUID.randomUUID();
        HotelAdminDemotionFence fence = new HotelAdminDemotionFence(ownerId);
        when(repository.findForUpdate(ownerId)).thenReturn(Optional.of(fence));
        HotelAdminDemotionFenceService service = new HotelAdminDemotionFenceService(repository);

        service.acquire(ownerId, transitionId);
        service.acquire(ownerId, transitionId);

        assertThat(fence.getTransitionId()).isEqualTo(transitionId);
        InOrder order = inOrder(repository);
        order.verify(repository).ensureOwnerRow(ownerId);
        order.verify(repository).findForUpdate(ownerId);
        order.verify(repository).ensureOwnerRow(ownerId);
        order.verify(repository).findForUpdate(ownerId);
    }

    @Test
    void differentTransitionCannotStealOrReleaseFence() {
        UUID ownerId = UUID.randomUUID();
        UUID transitionId = UUID.randomUUID();
        HotelAdminDemotionFence fence = new HotelAdminDemotionFence(ownerId);
        fence.activate(transitionId);
        when(repository.findForUpdate(ownerId)).thenReturn(Optional.of(fence));
        HotelAdminDemotionFenceService service = new HotelAdminDemotionFenceService(repository);

        assertThatThrownBy(() -> service.acquire(ownerId, UUID.randomUUID()))
                .isInstanceOf(HotelAdminDemotionFenceException.class);
        assertThatThrownBy(() -> service.release(ownerId, UUID.randomUUID()))
                .isInstanceOf(HotelAdminDemotionFenceException.class);
        assertThat(fence.getTransitionId()).isEqualTo(transitionId);
    }

    @Test
    void activeFenceRejectsOwnerFinancialMutation() {
        UUID ownerId = UUID.randomUUID();
        HotelAdminDemotionFence fence = new HotelAdminDemotionFence(ownerId);
        fence.activate(UUID.randomUUID());
        when(repository.findForUpdate(ownerId)).thenReturn(Optional.of(fence));
        HotelAdminDemotionFenceService service = new HotelAdminDemotionFenceService(repository);

        assertThatThrownBy(() -> service.ensureOwnerMutationAllowed(ownerId))
                .isInstanceOf(HotelAdminDemotionFenceException.class)
                .hasMessageContaining("không thể phát sinh giao dịch tài chính mới");
    }

    @Test
    void releaseClearsFenceAndInactiveReleaseIsIdempotent() {
        UUID ownerId = UUID.randomUUID();
        UUID transitionId = UUID.randomUUID();
        HotelAdminDemotionFence fence = new HotelAdminDemotionFence(ownerId);
        fence.activate(transitionId);
        when(repository.findForUpdate(ownerId)).thenReturn(Optional.of(fence));
        HotelAdminDemotionFenceService service = new HotelAdminDemotionFenceService(repository);

        service.release(ownerId, transitionId);
        service.release(ownerId, transitionId);

        assertThat(fence.getTransitionId()).isNull();
    }
}
