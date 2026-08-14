package com.smarthotel.payment.payment.repository;

import com.smarthotel.payment.payment.entity.PaymentOrder;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentOrderRepository extends JpaRepository<PaymentOrder, UUID> {
    Optional<PaymentOrder> findByOrderCode(Long orderCode);
    List<PaymentOrder> findAllByCustomerIdOrderByCreatedAtDesc(UUID customerId);
    boolean existsByOrderCode(Long orderCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PaymentOrder p where p.orderCode = :orderCode")
    Optional<PaymentOrder> findByOrderCodeForUpdate(@Param("orderCode") Long orderCode);
}
