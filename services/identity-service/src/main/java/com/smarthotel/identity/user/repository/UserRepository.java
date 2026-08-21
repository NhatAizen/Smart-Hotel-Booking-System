package com.smarthotel.identity.user.repository;

import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    boolean existsByEmailIgnoreCase(String email);

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    Optional<User> findByUsernameIgnoreCase(String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where lower(user.email) = lower(:email)")
    Optional<User> findByEmailIgnoreCaseForUpdate(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where lower(user.username) = lower(:username)")
    Optional<User> findByUsernameIgnoreCaseForUpdate(@Param("username") String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.id = :id")
    Optional<User> findByIdForUpdate(@Param("id") UUID id);

    long countByRoleAndActiveTrue(UserRole role);
}
