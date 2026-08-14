package com.smarthotel.identity.rolechange.repository;

import com.smarthotel.identity.user.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface RoleChangeUserRepository extends Repository<User, UUID> {

    Optional<User> findById(UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.id = :id")
    Optional<User> findByIdForUpdate(@Param("id") UUID id);

    @Modifying(flushAutomatically = true)
    @Query(value = """
            UPDATE users
            SET role = 'HOTEL_ADMIN', updated_at = CURRENT_TIMESTAMP
            WHERE id = :id AND role = 'CUSTOMER'
            """, nativeQuery = true)
    int promoteCustomer(@Param("id") UUID id);

    @Modifying(flushAutomatically = true)
    @Query(value = """
            UPDATE users
            SET role = 'CUSTOMER', updated_at = CURRENT_TIMESTAMP
            WHERE id = :id AND role = 'HOTEL_ADMIN'
            """, nativeQuery = true)
    int demoteHotelAdmin(@Param("id") UUID id);
}
