package com.smarthotel.booking.policy.service;

import com.smarthotel.booking.policy.dto.PlatformPolicyResponse;
import com.smarthotel.booking.policy.dto.UpdatePlatformPolicyRequest;
import com.smarthotel.booking.policy.entity.PlatformPolicySettings;
import com.smarthotel.booking.policy.repository.PlatformPolicySettingsRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlatformPolicyServiceTest {

    @Mock
    private PlatformPolicySettingsRepository repository;

    @Test
    void systemConfigIsReturnedFromThePersistedSingleton() {
        PlatformPolicySettings settings = new PlatformPolicySettings(18);
        when(repository.findById(PlatformPolicySettings.SINGLETON_ID))
                .thenReturn(Optional.of(settings));

        PlatformPolicyResponse response = new PlatformPolicyService(repository).get();

        assertEquals(18, response.minimumBookingAge());
        assertEquals(18, response.minimumCheckInAge());
        assertTrue(response.refundRequestEligibleBookingStatuses().contains("CANCELLED"));
        assertEquals("CHECKED_OUT", response.reviewEligibleBookingStatus());
    }

    @Test
    void updatePersistsTheSameRuleUsedByBookingAndCheckIn() {
        PlatformPolicySettings settings = new PlatformPolicySettings(18);
        when(repository.findById(PlatformPolicySettings.SINGLETON_ID))
                .thenReturn(Optional.of(settings));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        UUID adminId = UUID.randomUUID();

        PlatformPolicyResponse response = new PlatformPolicyService(repository)
                .update(adminId, new UpdatePlatformPolicyRequest(20));

        assertEquals(20, response.minimumBookingAge());
        assertEquals(20, response.minimumCheckInAge());
        assertEquals(adminId, response.updatedBy());
    }
}
