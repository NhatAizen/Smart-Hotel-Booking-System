package com.smarthotel.payment.payment.service;

import com.smarthotel.payment.integration.booking.BookingClient;
import com.smarthotel.payment.integration.hotel.HotelClient;
import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentType;
import com.smarthotel.payment.payment.repository.PaymentOrderRepository;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import com.smarthotel.payment.payos.PayOsApiClient;
import com.smarthotel.payment.payos.config.PayOsProperties;
import com.smarthotel.payment.wallet.service.HotelAdminDemotionFenceService;
import com.smarthotel.payment.wallet.service.RoleChangePaymentFinalityGuard;
import com.smarthotel.payment.wallet.service.WalletService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentServiceOwnershipTest {
    @Mock PaymentRepository paymentRepository;
    @Mock PaymentOrderRepository orderRepository;
    @Mock BookingClient bookingClient;
    @Mock HotelClient hotelClient;
    @Mock PayOsApiClient payOsClient;
    @Mock WalletService walletService;
    @Mock RoleChangePaymentFinalityGuard roleChangePaymentFinalityGuard;
    @Mock HotelAdminDemotionFenceService hotelAdminDemotionFenceService;

    private PaymentService service;
    private UUID customerId;
    private UUID hotelOwnerId;
    private Payment payment;

    @BeforeEach
    void setUp() {
        service = new PaymentService(
                paymentRepository,
                orderRepository,
                bookingClient,
                hotelClient,
                payOsClient,
                new PayOsProperties(),
                walletService,
                roleChangePaymentFinalityGuard,
                hotelAdminDemotionFenceService
        );
        customerId = UUID.randomUUID();
        hotelOwnerId = UUID.randomUUID();
        payment = new Payment(
                null,
                UUID.randomUUID(),
                customerId,
                UUID.randomUUID(),
                hotelOwnerId,
                new BigDecimal("100000"),
                PaymentMethod.PAYOS,
                PaymentType.FULL_PAYMENT,
                new BigDecimal("10")
        );
    }

    @Test
    void paymentDetailAllowsCustomerHotelOwnerAndSystemAdminOnly() {
        when(paymentRepository.findById(payment.getId())).thenReturn(Optional.of(payment));

        assertDoesNotThrow(() -> service.getById(payment.getId(), customerId, "CUSTOMER"));
        assertDoesNotThrow(() -> service.getById(payment.getId(), hotelOwnerId, "HOTEL_ADMIN"));
        assertDoesNotThrow(() -> service.getById(
                payment.getId(), UUID.randomUUID(), "ROLE_SYSTEM_ADMIN"));
        assertThrows(AccessDeniedException.class, () -> service.getById(
                payment.getId(), UUID.randomUUID(), "CUSTOMER"));
    }

    @Test
    void bookingPaymentsApplyOwnershipToEveryReturnedPayment() {
        when(paymentRepository.findAllByBookingIdOrderByCreatedAtDesc(payment.getBookingId()))
                .thenReturn(List.of(payment));

        assertDoesNotThrow(() -> service.getByBooking(
                payment.getBookingId(), customerId, "CUSTOMER"));
        assertThrows(AccessDeniedException.class, () -> service.getByBooking(
                payment.getBookingId(), UUID.randomUUID(), "HOTEL_ADMIN"));
    }

    @Test
    void customerHistoryAllowsSelfOrSystemAdminOnly() {
        when(paymentRepository.findAllByCustomerIdOrderByCreatedAtDesc(customerId))
                .thenReturn(List.of(payment));

        assertDoesNotThrow(() -> service.getByCustomer(customerId, customerId, "CUSTOMER"));
        assertDoesNotThrow(() -> service.getByCustomer(
                customerId, UUID.randomUUID(), "SYSTEM_ADMIN"));
        assertThrows(AccessDeniedException.class, () -> service.getByCustomer(
                customerId, UUID.randomUUID(), "CUSTOMER"));
    }
}
