package com.smarthotel.booking.policy.service;

import com.smarthotel.booking.policy.dto.PlatformPolicyResponse;
import com.smarthotel.booking.policy.dto.UpdatePlatformPolicyRequest;
import com.smarthotel.booking.policy.entity.PlatformPolicySettings;
import com.smarthotel.booking.policy.repository.PlatformPolicySettingsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class PlatformPolicyService {

    private static final int EXISTING_MINIMUM_AGE = 18;
    private final PlatformPolicySettingsRepository repository;

    public PlatformPolicyService(PlatformPolicySettingsRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public PlatformPolicyResponse get() {
        return PlatformPolicyResponse.from(current());
    }

    @Transactional(readOnly = true)
    public int minimumBookingAge() {
        return current().getMinimumBookingAge();
    }

    @Transactional
    public PlatformPolicyResponse update(UUID systemAdminId, UpdatePlatformPolicyRequest request) {
        PlatformPolicySettings settings = repository
                .findById(PlatformPolicySettings.SINGLETON_ID)
                .orElseGet(() -> new PlatformPolicySettings(EXISTING_MINIMUM_AGE));
        settings.updateMinimumBookingAge(request.minimumBookingAge(), systemAdminId);
        return PlatformPolicyResponse.from(repository.save(settings));
    }

    private PlatformPolicySettings current() {
        return repository.findById(PlatformPolicySettings.SINGLETON_ID)
                .orElseGet(() -> new PlatformPolicySettings(EXISTING_MINIMUM_AGE));
    }
}
