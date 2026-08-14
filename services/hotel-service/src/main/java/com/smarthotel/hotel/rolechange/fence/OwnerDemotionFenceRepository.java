package com.smarthotel.hotel.rolechange.fence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public class OwnerDemotionFenceRepository {

    private final JdbcTemplate jdbcTemplate;

    public OwnerDemotionFenceRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public FenceState lock(UUID ownerId) {
        jdbcTemplate.update(
                """
                INSERT INTO owner_demotion_fences (owner_id, frozen)
                VALUES (?, FALSE)
                ON CONFLICT (owner_id) DO NOTHING
                """,
                ownerId
        );
        return jdbcTemplate.queryForObject(
                """
                SELECT owner_id, transition_id, frozen
                FROM owner_demotion_fences
                WHERE owner_id = ?
                FOR UPDATE
                """,
                (resultSet, rowNumber) -> new FenceState(
                        resultSet.getObject("owner_id", UUID.class),
                        resultSet.getObject("transition_id", UUID.class),
                        resultSet.getBoolean("frozen")
                ),
                ownerId
        );
    }

    public void freeze(UUID ownerId, UUID transitionId) {
        jdbcTemplate.update(
                """
                UPDATE owner_demotion_fences
                SET transition_id = ?, frozen = TRUE,
                    frozen_at = COALESCE(frozen_at, CURRENT_TIMESTAMP),
                    unfrozen_at = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE owner_id = ?
                """,
                transitionId,
                ownerId
        );
    }

    public void unfreeze(UUID ownerId) {
        jdbcTemplate.update(
                """
                UPDATE owner_demotion_fences
                SET transition_id = NULL, frozen = FALSE,
                    unfrozen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE owner_id = ?
                """,
                ownerId
        );
    }

    public record FenceState(UUID ownerId, UUID transitionId, boolean frozen) {
    }
}

