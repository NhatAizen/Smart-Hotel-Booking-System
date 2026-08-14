package com.smarthotel.identity.rolechange.service;

import com.smarthotel.identity.rolechange.dto.RoleChangeEligibilityResponse;
import com.smarthotel.identity.rolechange.entity.PartnerDeactivationRequest;
import com.smarthotel.identity.rolechange.entity.PartnerDeactivationStatus;
import com.smarthotel.identity.rolechange.exception.RoleChangeConflictException;
import com.smarthotel.identity.rolechange.integration.RoleChangeOperationsClient;
import com.smarthotel.identity.rolechange.repository.PartnerDeactivationRequestRepository;
import com.smarthotel.identity.rolechange.repository.RoleChangePartnerRequestRepository;
import com.smarthotel.identity.rolechange.repository.RoleChangeUserRepository;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RoleChangeServiceTest {

    @Mock
    private RoleChangeUserRepository userRepository;

    @Mock
    private PartnerDeactivationRequestRepository deactivationRepository;

    @Mock
    private RoleChangePartnerRequestRepository partnerRequestRepository;

    @Mock
    private RefreshTokenService refreshTokenService;

    @Mock
    private RoleChangeOperationsClient operationsClient;

    @Mock
    private EntityManager entityManager;

    @Mock
    private PlatformTransactionManager transactionManager;

    @Mock
    private TransactionStatus transactionStatus;

    @Mock
    private Query auditContextQuery;

    private RoleChangeService service;

    @BeforeEach
    void setUp() {
        lenient().when(transactionManager.getTransaction(any(TransactionDefinition.class)))
                .thenReturn(transactionStatus);
        lenient().when(entityManager.createNativeQuery(any(String.class)))
                .thenReturn(auditContextQuery);
        lenient().when(auditContextQuery.setParameter(any(String.class), any()))
                .thenReturn(auditContextQuery);
        lenient().when(auditContextQuery.getSingleResult()).thenReturn("");

        service = new RoleChangeService(
                userRepository,
                deactivationRepository,
                partnerRequestRepository,
                refreshTokenService,
                operationsClient,
                entityManager,
                transactionManager
        );
    }

    @Test
    void promotionAllowsOnlyCustomerToHotelAdmin() {
        UUID actorId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        User actor = user(actorId, UserRole.SYSTEM_ADMIN);
        User customer = user(targetId, UserRole.CUSTOMER);
        User promoted = user(targetId, UserRole.HOTEL_ADMIN);

        when(userRepository.findByIdForUpdate(actorId)).thenReturn(Optional.of(actor));
        when(userRepository.findByIdForUpdate(targetId)).thenReturn(Optional.of(customer));
        when(userRepository.promoteCustomer(targetId)).thenReturn(1);
        when(userRepository.findById(targetId)).thenReturn(Optional.of(promoted));

        var response = service.promoteToHotelAdmin(actorId, targetId, "Direct conversion");

        assertEquals("HOTEL_ADMIN", response.role());
        verify(userRepository).promoteCustomer(targetId);
        verify(partnerRequestRepository).supersedePendingAfterPromotion(
                org.mockito.ArgumentMatchers.eq(targetId),
                org.mockito.ArgumentMatchers.eq(actorId),
                any(String.class)
        );
        verify(refreshTokenService).revokeAllForUser(targetId);
    }

    @Test
    void promotionNeverChangesSystemAdmin() {
        UUID actorId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        when(userRepository.findByIdForUpdate(actorId))
                .thenReturn(Optional.of(user(actorId, UserRole.SYSTEM_ADMIN)));
        when(userRepository.findByIdForUpdate(targetId))
                .thenReturn(Optional.of(user(targetId, UserRole.SYSTEM_ADMIN)));

        assertThrows(
                RoleChangeConflictException.class,
                () -> service.promoteToHotelAdmin(actorId, targetId, "Must be rejected")
        );

        verify(userRepository, never()).promoteCustomer(targetId);
        verify(refreshTokenService, never()).revokeAllForUser(targetId);
    }

    @Test
    void nonSystemAdminCannotPromote() {
        UUID actorId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        when(userRepository.findByIdForUpdate(actorId))
                .thenReturn(Optional.of(user(actorId, UserRole.HOTEL_ADMIN)));

        assertThrows(
                AccessDeniedException.class,
                () -> service.promoteToHotelAdmin(actorId, targetId, "Not authorized")
        );

        verify(userRepository, never()).promoteCustomer(targetId);
    }

    @Test
    void demotionStopsBeforeDeactivationWhenOperationalChecksAreBlocked() {
        UUID actorId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        String token = "system-admin-token";
        when(userRepository.findByIdForUpdate(actorId))
                .thenReturn(Optional.of(user(actorId, UserRole.SYSTEM_ADMIN)));
        when(userRepository.findByIdForUpdate(targetId))
                .thenReturn(Optional.of(user(targetId, UserRole.HOTEL_ADMIN)));
        when(operationsClient.getOwnerHotels(targetId, token))
                .thenReturn(new RoleChangeOperationsClient.OwnerHotelPortfolioResponse(
                        List.of(UUID.randomUUID()),
                        1,
                        1
                ));
        when(operationsClient.getBookingEligibility(any(), any(), any()))
                .thenReturn(new RoleChangeOperationsClient.BookingEligibilityResponse(
                        false,
                        1,
                        2,
                        List.of("CURRENT_STAYS", "UPCOMING_BOOKINGS")
                ));
        when(operationsClient.getPaymentEligibility(targetId, token))
                .thenReturn(eligiblePayment());

        RoleChangeConflictException exception = assertThrows(
                RoleChangeConflictException.class,
                () -> service.demoteToCustomer(
                        actorId,
                        targetId,
                        "Direct downgrade",
                        token
                )
        );

        assertEquals(true, exception.getMessage().contains("CURRENT_STAYS"));
        verify(operationsClient, never()).deactivateOwnerHotels(any(), any());
        verify(userRepository, never()).demoteHotelAdmin(targetId);
    }

    @Test
    void eligibilityExposesWithdrawalAndFinancialAliases() {
        UUID actorId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        String token = "system-admin-token";
        when(userRepository.findById(actorId))
                .thenReturn(Optional.of(user(actorId, UserRole.SYSTEM_ADMIN)));
        when(userRepository.findById(targetId))
                .thenReturn(Optional.of(user(targetId, UserRole.HOTEL_ADMIN)));
        when(operationsClient.getOwnerHotels(targetId, token))
                .thenReturn(new RoleChangeOperationsClient.OwnerHotelPortfolioResponse(
                        List.of(),
                        0,
                        0
                ));
        when(operationsClient.getBookingEligibility(targetId, List.of(), token))
                .thenReturn(new RoleChangeOperationsClient.BookingEligibilityResponse(
                        true,
                        0,
                        0,
                        List.of()
                ));
        when(operationsClient.getPaymentEligibility(targetId, token))
                .thenReturn(new RoleChangeOperationsClient.PaymentEligibilityResponse(
                        false,
                        3,
                        BigDecimal.TEN,
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        2,
                        0,
                        1,
                        List.of("OPEN_WITHDRAWALS")
                ));

        RoleChangeEligibilityResponse response =
                service.getAdminDemotionEligibility(actorId, targetId, token);

        assertEquals(3, response.pendingWithdrawalCount());
        assertEquals(4, response.financialIssueCount());
        assertEquals(false, response.eligible());
    }

    @Test
    void directDemotionApprovesPendingDeactivationWithoutRewritingPartnerHistory() {
        UUID actorId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        String token = "system-admin-token";
        User actor = user(actorId, UserRole.SYSTEM_ADMIN);
        User hotelAdmin = user(targetId, UserRole.HOTEL_ADMIN);
        User customer = user(targetId, UserRole.CUSTOMER);
        PartnerDeactivationRequest request =
                new PartnerDeactivationRequest(targetId, "Stop partnership");
        ReflectionTestUtils.invokeMethod(request, "prePersist");

        when(userRepository.findByIdForUpdate(actorId)).thenReturn(Optional.of(actor));
        when(userRepository.findByIdForUpdate(targetId)).thenReturn(Optional.of(hotelAdmin));
        when(deactivationRepository.findByUserIdAndStatusForUpdate(
                targetId,
                PartnerDeactivationStatus.PENDING
        )).thenReturn(Optional.of(request));
        when(operationsClient.getOwnerHotels(targetId, token))
                .thenReturn(new RoleChangeOperationsClient.OwnerHotelPortfolioResponse(
                        List.of(),
                        0,
                        0
                ));
        when(operationsClient.getBookingEligibility(targetId, List.of(), token))
                .thenReturn(new RoleChangeOperationsClient.BookingEligibilityResponse(
                        true,
                        0,
                        0,
                        List.of()
                ));
        when(operationsClient.getPaymentEligibility(targetId, token))
                .thenReturn(eligiblePayment());
        when(operationsClient.deactivateOwnerHotels(targetId, token))
                .thenReturn(new RoleChangeOperationsClient.DeactivateOwnerHotelsResponse(0));
        when(userRepository.demoteHotelAdmin(targetId)).thenReturn(1);
        when(userRepository.findById(targetId)).thenReturn(Optional.of(customer));

        var response = service.demoteToCustomer(
                actorId,
                targetId,
                "Direct downgrade",
                token
        );

        assertEquals("CUSTOMER", response.role());
        assertEquals(PartnerDeactivationStatus.APPROVED, request.getStatus());
        assertEquals(actorId, request.getReviewedBy());
        verify(partnerRequestRepository, never()).supersedePendingAfterPromotion(
                any(),
                any(),
                any(String.class)
        );
        verify(refreshTokenService).revokeAllForUser(targetId);
    }

    @Test
    void demotionFailsWhenHotelServiceStillReportsAnActiveHotel() {
        UUID actorId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        UUID hotelId = UUID.randomUUID();
        String token = "system-admin-token";
        when(userRepository.findByIdForUpdate(actorId))
                .thenReturn(Optional.of(user(actorId, UserRole.SYSTEM_ADMIN)));
        when(userRepository.findByIdForUpdate(targetId))
                .thenReturn(Optional.of(user(targetId, UserRole.HOTEL_ADMIN)));
        when(operationsClient.getOwnerHotels(targetId, token))
                .thenReturn(
                        new RoleChangeOperationsClient.OwnerHotelPortfolioResponse(
                                List.of(hotelId),
                                1,
                                1
                        ),
                        new RoleChangeOperationsClient.OwnerHotelPortfolioResponse(
                                List.of(hotelId),
                                1,
                                1
                        )
                );
        when(operationsClient.getBookingEligibility(targetId, List.of(hotelId), token))
                .thenReturn(new RoleChangeOperationsClient.BookingEligibilityResponse(
                        true,
                        0,
                        0,
                        List.of()
                ));
        when(operationsClient.getPaymentEligibility(targetId, token))
                .thenReturn(eligiblePayment());
        when(operationsClient.deactivateOwnerHotels(targetId, token))
                .thenReturn(new RoleChangeOperationsClient.DeactivateOwnerHotelsResponse(0));

        RoleChangeConflictException exception = assertThrows(
                RoleChangeConflictException.class,
                () -> service.demoteToCustomer(
                        actorId,
                        targetId,
                        "Direct downgrade",
                        token
                )
        );

        assertEquals(true, exception.getMessage().contains("vẫn còn 1 khách sạn"));
        verify(userRepository, never()).demoteHotelAdmin(targetId);
        verify(refreshTokenService, never()).revokeAllForUser(targetId);
    }

    private RoleChangeOperationsClient.PaymentEligibilityResponse eligiblePayment() {
        return new RoleChangeOperationsClient.PaymentEligibilityResponse(
                true,
                0,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                0,
                0,
                0,
                List.of()
        );
    }

    private User user(UUID id, UserRole role) {
        User user = new User(
                role.name().toLowerCase() + "@example.com",
                "encoded-password",
                role.name(),
                role
        );
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }
}
