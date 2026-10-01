package com.smarthotel.payment.payment.service;

import com.smarthotel.payment.integration.booking.BookingClient;
import com.smarthotel.payment.integration.hotel.HotelClient;
import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentType;
import com.smarthotel.payment.payment.entity.PaymentOrder;
import com.smarthotel.payment.payment.entity.PaymentOrderStatus;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
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
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.assertj.core.api.Assertions.assertThat;

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
    void roomChangeWalletCreditBlocksAutomaticFullRefundBeforeAnyWalletMutation() {
        payment.markPaid("TX-" + UUID.randomUUID());
        payment.markWalletApplied();
        when(paymentRepository.findBookingIdById(payment.getId()))
                .thenReturn(Optional.of(payment.getBookingId()));
        doThrow(new IllegalStateException("ROOM_CHANGE_RECONCILIATION_REQUIRED"))
                .when(walletService)
                .assertNoRoomChangeCreditConflict(payment.getBookingId());

        assertThrows(IllegalStateException.class,
                () -> service.refundComponentForApprovedRequest(payment.getId()));

        verify(walletService).assertNoRoomChangeCreditConflict(payment.getBookingId());
        verify(walletService, never()).reverseSuccessfulPayment(payment);
        verify(walletService, never()).creditCustomerRefund(payment);
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

    @Test
    void duplicatePayOsCallbackSettlesEachAllocationExactlyOnceUnderBookingMutex() {
        PaymentOrder order = new PaymentOrder(202610020001L, customerId,
                PaymentType.FULL_PAYMENT, payment.getAmount(), "local regression", null);
        var payload = JsonNodeFactory.instance.objectNode();
        when(payOsClient.verifyWebhook(payload)).thenReturn(new PayOsApiClient.WebhookData(
                true, "00", order.getOrderCode(), 100000, "LOCAL-REF", null, "00", "success"));
        when(orderRepository.findByOrderCodeForUpdate(order.getOrderCode())).thenReturn(Optional.of(order));
        when(paymentRepository.findBookingIdsByPaymentOrderId(order.getId()))
                .thenReturn(List.of(payment.getBookingId()));
        when(paymentRepository.findAllByPaymentOrderIdOrderByCreatedAtAsc(order.getId()))
                .thenReturn(List.of(payment));

        service.handlePayOsWebhook(payload);
        service.handlePayOsWebhook(payload);

        assertThat(order.getStatus()).isEqualTo(PaymentOrderStatus.PAID);
        verify(walletService).applySuccessfulPayment(payment);
        verify(bookingClient).applyPayment(payment.getBookingId(), payment.getAmount(), payment.getPaymentType());
        var ordering = inOrder(walletService, bookingClient);
        ordering.verify(walletService).lockBookings(List.of(payment.getBookingId()));
        ordering.verify(bookingClient).applyPayment(payment.getBookingId(), payment.getAmount(), payment.getPaymentType());
        ordering.verify(walletService).applySuccessfulPayment(payment);
    }

    @Test
    void mismatchedPayOsAmountCannotMutateBookingOrWallet() {
        PaymentOrder order = new PaymentOrder(202610020002L, customerId,
                PaymentType.FULL_PAYMENT, payment.getAmount(), "local regression", null);
        var payload = JsonNodeFactory.instance.objectNode();
        when(payOsClient.verifyWebhook(payload)).thenReturn(new PayOsApiClient.WebhookData(
                true, "00", order.getOrderCode(), 99999, "LOCAL-REF", null, "00", "success"));
        when(orderRepository.findByOrderCodeForUpdate(order.getOrderCode())).thenReturn(Optional.of(order));

        assertThrows(IllegalArgumentException.class, () -> service.handlePayOsWebhook(payload));
        assertThat(order.getStatus()).isEqualTo(PaymentOrderStatus.PENDING);
        verifyNoInteractions(walletService, bookingClient, paymentRepository);
    }

    @Test
    void legacySinglePaymentRefundCannotFinalizeSplitPaymentBooking() {
        payment.markPaid("LOCAL-SPLIT");
        Payment second = new Payment(payment.getBookingId(), customerId, new BigDecimal("50000"),
                PaymentMethod.PAYOS, PaymentType.REMAINING_PAYMENT);
        second.markPaid("LOCAL-SPLIT-2");
        when(paymentRepository.findBookingIdById(payment.getId())).thenReturn(Optional.of(payment.getBookingId()));
        when(paymentRepository.findAllByBookingIdOrderByCreatedAtDesc(payment.getBookingId()))
                .thenReturn(List.of(payment, second));
        assertThrows(IllegalStateException.class, () -> service.refund(payment.getId()));
        verifyNoInteractions(bookingClient);
        verify(walletService, never()).reverseSuccessfulPayment(payment);
    }
}
