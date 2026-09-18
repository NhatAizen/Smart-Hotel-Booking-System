package com.smarthotel.booking.policy.repository;

import com.smarthotel.booking.policy.entity.PlatformPolicySettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformPolicySettingsRepository
        extends JpaRepository<PlatformPolicySettings, Short> {
}
