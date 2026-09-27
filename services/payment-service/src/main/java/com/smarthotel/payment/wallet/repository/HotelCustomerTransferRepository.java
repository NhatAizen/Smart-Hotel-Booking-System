package com.smarthotel.payment.wallet.repository;

import com.smarthotel.payment.wallet.entity.HotelCustomerTransfer;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface HotelCustomerTransferRepository extends JpaRepository<HotelCustomerTransfer, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from HotelCustomerTransfer t where t.id = :id")
    Optional<HotelCustomerTransfer> findForUpdate(@Param("id") UUID id);
}
