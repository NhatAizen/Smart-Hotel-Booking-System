package com.smarthotel.identity.rolechange.service;

import com.smarthotel.identity.common.exception.UserNotFoundException;
import com.smarthotel.identity.rolechange.dto.PartnerDeactivationResponse;
import com.smarthotel.identity.rolechange.dto.RoleChangeEligibilityResponse;
import com.smarthotel.identity.rolechange.dto.RoleChangeUserResponse;
import com.smarthotel.identity.rolechange.entity.PartnerDeactivationRequest;
import com.smarthotel.identity.rolechange.entity.PartnerDeactivationStatus;
import com.smarthotel.identity.rolechange.exception.RoleChangeConflictException;
import com.smarthotel.identity.rolechange.exception.RoleChangeNotFoundException;
import com.smarthotel.identity.rolechange.integration.RoleChangeOperationsClient;
import com.smarthotel.identity.rolechange.repository.PartnerDeactivationRequestRepository;
import com.smarthotel.identity.rolechange.repository.RoleChangePartnerRequestRepository;
import com.smarthotel.identity.rolechange.repository.RoleChangeUserRepository;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import jakarta.persistence.EntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

@Service
public class RoleChangeService {

    private static final String ADMIN_DIRECT = "ADMIN_DIRECT";
    private static final String PARTNER_DEACTIVATION = "PARTNER_DEACTIVATION";
    private static final String DIRECT_PROMOTION_SUPERSEDED =
            "Hồ sơ được đóng do System Admin đã chuyển trực tiếp tài khoản thành Hotel Admin";

    private final RoleChangeUserRepository userRepository;
    private final PartnerDeactivationRequestRepository deactivationRepository;
    private final RoleChangePartnerRequestRepository partnerRequestRepository;
    private final RefreshTokenService refreshTokenService;
    private final RoleChangeOperationsClient operationsClient;
    private final EntityManager entityManager;
    private final TransactionTemplate transactionTemplate;

    public RoleChangeService(
            RoleChangeUserRepository userRepository,
            PartnerDeactivationRequestRepository deactivationRepository,
            RoleChangePartnerRequestRepository partnerRequestRepository,
            RefreshTokenService refreshTokenService,
            RoleChangeOperationsClient operationsClient,
            EntityManager entityManager,
            PlatformTransactionManager transactionManager
    ) {
        this.userRepository = userRepository;
        this.deactivationRepository = deactivationRepository;
        this.partnerRequestRepository = partnerRequestRepository;
        this.refreshTokenService = refreshTokenService;
        this.operationsClient = operationsClient;
        this.entityManager = entityManager;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public RoleChangeUserResponse promoteToHotelAdmin(
            UUID systemAdminId,
            UUID targetUserId,
            String reason
    ) {
        String normalizedReason = normalizeReason(reason);

        return requiredTransactionResult(transactionTemplate.execute(status -> {
            User actor = requireSystemAdminForUpdate(systemAdminId);
            User target = requireTargetForUpdate(targetUserId);
            ensureNotDeleted(target);

            if (target.getRole() != UserRole.CUSTOMER) {
                throw exactTransitionConflict(target, UserRole.CUSTOMER, UserRole.HOTEL_ADMIN);
            }

            partnerRequestRepository.lockPendingForUser(target.getId());
            setAuditContext(actor.getId(), normalizedReason, ADMIN_DIRECT, null);
            if (userRepository.promoteCustomer(target.getId()) != 1) {
                throw new RoleChangeConflictException(
                        "Tài khoản không còn ở vai trò Customer"
                );
            }
            partnerRequestRepository.supersedePendingAfterPromotion(
                    target.getId(),
                    actor.getId(),
                    DIRECT_PROMOTION_SUPERSEDED
            );
            refreshTokenService.revokeAllForUser(target.getId());
            entityManager.clear();
            return RoleChangeUserResponse.from(findUser(target.getId()));
        }));
    }

    public RoleChangeEligibilityResponse getAdminDemotionEligibility(
            UUID systemAdminId,
            UUID targetUserId,
            String bearerToken
    ) {
        requireSystemAdmin(systemAdminId);
        User target = findUser(targetUserId);
        ensureNotDeleted(target);
        ensureHotelAdmin(target);
        return loadEligibility(target.getId(), bearerToken);
    }

    public RoleChangeUserResponse demoteToCustomer(
            UUID systemAdminId,
            UUID targetUserId,
            String reason,
            String bearerToken
    ) {
        String normalizedReason = normalizeReason(reason);

        return requiredTransactionResult(transactionTemplate.execute(status -> {
            User actor = requireSystemAdminForUpdate(systemAdminId);
            User lockedTarget = requireTargetForUpdate(targetUserId);
            ensureNotDeleted(lockedTarget);
            ensureHotelAdmin(lockedTarget);

            PartnerDeactivationRequest pendingRequest = deactivationRepository
                    .findByUserIdAndStatusForUpdate(
                            targetUserId,
                            PartnerDeactivationStatus.PENDING
                    )
                    .orElse(null);

            assertEligible(loadEligibility(targetUserId, bearerToken));
            operationsClient.deactivateOwnerHotels(targetUserId, bearerToken);
            assertClearAfterHotelDeactivation(
                    loadEligibility(targetUserId, bearerToken)
            );

            if (pendingRequest != null) {
                pendingRequest.approve(actor.getId());
                entityManager.flush();
            }
            setAuditContext(
                    actor.getId(),
                    normalizedReason,
                    ADMIN_DIRECT,
                    pendingRequest == null ? null : pendingRequest.getId()
            );
            demoteLockedUser(lockedTarget);
            return RoleChangeUserResponse.from(findUserAfterClear(targetUserId));
        }));
    }

    public RoleChangeEligibilityResponse getSelfDemotionEligibility(
            UUID hotelAdminId,
            String bearerToken
    ) {
        requireActiveHotelAdmin(hotelAdminId);
        return loadEligibility(hotelAdminId, bearerToken);
    }

    public PartnerDeactivationResponse submitDeactivation(
            UUID hotelAdminId,
            String reason,
            String bearerToken
    ) {
        String normalizedReason = normalizeReason(reason);
        requireActiveHotelAdmin(hotelAdminId);
        assertEligible(loadEligibility(hotelAdminId, bearerToken));

        try {
            return requiredTransactionResult(transactionTemplate.execute(status -> {
                User user = requireTargetForUpdate(hotelAdminId);
                requireActiveHotelAdmin(user);
                assertEligible(loadEligibility(hotelAdminId, bearerToken));

                if (deactivationRepository.existsByUserIdAndStatus(
                        hotelAdminId,
                        PartnerDeactivationStatus.PENDING
                )) {
                    throw new RoleChangeConflictException(
                            "Bạn đã có một yêu cầu ngừng làm đối tác đang chờ duyệt"
                    );
                }

                PartnerDeactivationRequest saved = deactivationRepository.save(
                        new PartnerDeactivationRequest(hotelAdminId, normalizedReason)
                );
                return PartnerDeactivationResponse.from(saved, user);
            }));
        } catch (DataIntegrityViolationException exception) {
            throw new RoleChangeConflictException(
                    "Bạn đã có một yêu cầu ngừng làm đối tác đang chờ duyệt"
            );
        }
    }

    public PartnerDeactivationResponse getMyLatestDeactivation(UUID hotelAdminId) {
        User user = findUser(hotelAdminId);
        if (user.getRole() != UserRole.HOTEL_ADMIN
                && user.getRole() != UserRole.CUSTOMER) {
            throw new AccessDeniedException(
                    "Only a current or just-deactivated Hotel Admin may read this request"
            );
        }
        PartnerDeactivationRequest request = deactivationRepository
                .findFirstByUserIdOrderByRequestedAtDesc(hotelAdminId)
                .orElseThrow(() -> new RoleChangeNotFoundException(
                        "No partner deactivation request exists for this account"
                ));
        return PartnerDeactivationResponse.from(request, user);
    }

    public List<PartnerDeactivationResponse> getDeactivations(
            UUID systemAdminId,
            PartnerDeactivationStatus status
    ) {
        requireSystemAdmin(systemAdminId);
        PartnerDeactivationStatus effectiveStatus = status == null
                ? PartnerDeactivationStatus.PENDING
                : status;

        return deactivationRepository
                .findAllByStatusOrderByRequestedAtAsc(effectiveStatus)
                .stream()
                .map(request -> PartnerDeactivationResponse.from(
                        request,
                        userRepository.findById(request.getUserId()).orElse(null)
                ))
                .toList();
    }

    public PartnerDeactivationResponse approveDeactivation(
            UUID systemAdminId,
            UUID requestId,
            String reason,
            String bearerToken
    ) {
        String normalizedReason = normalizeReason(reason);

        return requiredTransactionResult(transactionTemplate.execute(status -> {
            User actor = requireSystemAdminForUpdate(systemAdminId);
            PartnerDeactivationRequest currentRequest = findDeactivation(requestId);
            UUID targetUserId = currentRequest.getUserId();
            User lockedTarget = requireTargetForUpdate(targetUserId);
            PartnerDeactivationRequest request = deactivationRepository
                    .findByIdForUpdate(requestId)
                    .orElseThrow(() -> new RoleChangeNotFoundException(
                            "Partner deactivation request was not found"
                    ));
            ensureNotDeleted(lockedTarget);
            ensureHotelAdmin(lockedTarget);

            if (request.getStatus() != PartnerDeactivationStatus.PENDING) {
                throw new RoleChangeConflictException(
                        "Yêu cầu ngừng làm đối tác không còn ở trạng thái chờ duyệt"
                );
            }

            assertEligible(loadEligibility(targetUserId, bearerToken));
            operationsClient.deactivateOwnerHotels(targetUserId, bearerToken);
            assertClearAfterHotelDeactivation(
                    loadEligibility(targetUserId, bearerToken)
            );

            request.approve(actor.getId());
            entityManager.flush();
            setAuditContext(
                    actor.getId(),
                    normalizedReason,
                    PARTNER_DEACTIVATION,
                    request.getId()
            );
            demoteLockedUser(lockedTarget);
            entityManager.clear();
            PartnerDeactivationRequest savedRequest = findDeactivation(requestId);
            User savedTarget = findUser(targetUserId);
            return PartnerDeactivationResponse.from(savedRequest, savedTarget);
        }));
    }

    public PartnerDeactivationResponse rejectDeactivation(
            UUID systemAdminId,
            UUID requestId,
            String reason
    ) {
        String normalizedReason = normalizeReason(reason);

        return requiredTransactionResult(transactionTemplate.execute(status -> {
            User actor = requireSystemAdminForUpdate(systemAdminId);
            PartnerDeactivationRequest currentRequest = findDeactivation(requestId);
            User target = requireTargetForUpdate(currentRequest.getUserId());
            PartnerDeactivationRequest request = deactivationRepository
                    .findByIdForUpdate(requestId)
                    .orElseThrow(() -> new RoleChangeNotFoundException(
                            "Partner deactivation request was not found"
                    ));
            request.reject(actor.getId(), normalizedReason);
            return PartnerDeactivationResponse.from(request, target);
        }));
    }

    private RoleChangeEligibilityResponse loadEligibility(
            UUID ownerId,
            String bearerToken
    ) {
        RoleChangeOperationsClient.OwnerHotelPortfolioResponse portfolio =
                operationsClient.getOwnerHotels(ownerId, bearerToken);
        List<UUID> hotelIds = portfolio.hotelIds() == null
                ? List.of()
                : List.copyOf(portfolio.hotelIds());

        RoleChangeOperationsClient.BookingEligibilityResponse booking =
                operationsClient.getBookingEligibility(ownerId, hotelIds, bearerToken);
        RoleChangeOperationsClient.PaymentEligibilityResponse payment =
                operationsClient.getPaymentEligibility(ownerId, bearerToken);

        BigDecimal available = zero(payment.availableBalance());
        BigDecimal pending = zero(payment.pendingBalance());
        BigDecimal locked = zero(payment.lockedBalance());
        BigDecimal debt = zero(payment.commissionDebt());

        long financialIssueCount = payment.pendingPaymentCount()
                + payment.unsettledPaymentCount()
                + payment.openWalletTopUpCount()
                + nonZeroIssue(available)
                + nonZeroIssue(pending)
                + nonZeroIssue(locked)
                + nonZeroIssue(debt);

        LinkedHashSet<String> blockers = new LinkedHashSet<>();
        addBlockers(blockers, booking.blockers());
        addBlockers(blockers, payment.blockers());
        if (!booking.eligible() && blockers.isEmpty()) {
            blockers.add("Còn khách đang lưu trú hoặc booking sắp tới cần xử lý");
        }
        if (!payment.eligible() && blockers.isEmpty()) {
            blockers.add("Còn withdrawal hoặc vấn đề tài chính cần xử lý");
        }

        return new RoleChangeEligibilityResponse(
                booking.eligible() && payment.eligible(),
                hotelIds,
                portfolio.totalHotels(),
                portfolio.activeHotels(),
                booking.currentStayCount(),
                booking.actionableBookingCount(),
                payment.openWithdrawalCount(),
                financialIssueCount,
                available,
                pending,
                locked,
                debt,
                payment.pendingPaymentCount(),
                payment.unsettledPaymentCount(),
                payment.openWalletTopUpCount(),
                List.copyOf(blockers)
        );
    }

    private void assertEligible(RoleChangeEligibilityResponse eligibility) {
        if (eligibility.eligible()) {
            return;
        }

        String details = eligibility.blockers().isEmpty()
                ? "Còn nghiệp vụ cần xử lý"
                : String.join("; ", eligibility.blockers());
        throw new RoleChangeConflictException(
                "Chưa thể chuyển Hotel Admin về Customer: " + details
        );
    }

    private void assertClearAfterHotelDeactivation(
            RoleChangeEligibilityResponse eligibility
    ) {
        assertEligible(eligibility);
        if (eligibility.activeHotels() > 0) {
            throw new RoleChangeConflictException(
                    "Chưa thể chuyển Hotel Admin về Customer: vẫn còn "
                            + eligibility.activeHotels()
                            + " khách sạn đang hoạt động sau khi yêu cầu ngừng hoạt động"
            );
        }
    }

    private void demoteLockedUser(User target) {
        if (userRepository.demoteHotelAdmin(target.getId()) != 1) {
            throw new RoleChangeConflictException(
                    "Tài khoản không còn ở vai trò Hotel Admin"
            );
        }
        refreshTokenService.revokeAllForUser(target.getId());
    }

    private void setAuditContext(
            UUID actorId,
            String reason,
            String source,
            UUID sourceRequestId
    ) {
        setLocal("enziu.role_change_actor_id", actorId.toString());
        setLocal("enziu.role_change_reason", reason);
        setLocal("enziu.role_change_source", source);
        setLocal(
                "enziu.role_change_source_request_id",
                sourceRequestId == null ? "" : sourceRequestId.toString()
        );
    }

    private void setLocal(String key, String value) {
        entityManager.createNativeQuery("select set_config(:key, :value, true)")
                .setParameter("key", key)
                .setParameter("value", value)
                .getSingleResult();
    }

    private User findUserAfterClear(UUID userId) {
        entityManager.clear();
        return findUser(userId);
    }

    private User requireSystemAdminForUpdate(UUID userId) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(UserNotFoundException::new);
        requireSystemAdmin(user);
        return user;
    }

    private User requireTargetForUpdate(UUID userId) {
        return userRepository.findByIdForUpdate(userId)
                .orElseThrow(UserNotFoundException::new);
    }

    private User requireSystemAdmin(UUID userId) {
        User user = findUser(userId);
        requireSystemAdmin(user);
        return user;
    }

    private void requireSystemAdmin(User user) {
        if (user.isDeleted() || !user.isActive()
                || user.getRole() != UserRole.SYSTEM_ADMIN) {
            throw new AccessDeniedException(
                    "Chỉ System Admin đang hoạt động được đổi vai trò tài khoản"
            );
        }
    }

    private User requireActiveHotelAdmin(UUID userId) {
        User user = findUser(userId);
        requireActiveHotelAdmin(user);
        return user;
    }

    private void requireActiveHotelAdmin(User user) {
        if (user.isDeleted() || !user.isActive()
                || user.getRole() != UserRole.HOTEL_ADMIN) {
            throw new AccessDeniedException(
                    "Chỉ Hotel Admin đang hoạt động được gửi yêu cầu ngừng làm đối tác"
            );
        }
    }

    private void ensureHotelAdmin(User user) {
        if (user.getRole() != UserRole.HOTEL_ADMIN) {
            throw exactTransitionConflict(user, UserRole.HOTEL_ADMIN, UserRole.CUSTOMER);
        }
    }

    private void ensureNotDeleted(User user) {
        if (user.isDeleted()) {
            throw new RoleChangeConflictException(
                    "Không thể đổi vai trò tài khoản đã xóa"
            );
        }
    }

    private RoleChangeConflictException exactTransitionConflict(
            User user,
            UserRole expected,
            UserRole destination
    ) {
        if (user.getRole() == UserRole.SYSTEM_ADMIN) {
            return new RoleChangeConflictException(
                    "Tuyệt đối không được thay đổi vai trò của System Admin"
            );
        }
        return new RoleChangeConflictException(
                "Chỉ hỗ trợ chuyển " + expected.name() + " sang " + destination.name()
        );
    }

    private PartnerDeactivationRequest findDeactivation(UUID requestId) {
        return deactivationRepository.findById(requestId)
                .orElseThrow(() -> new RoleChangeNotFoundException(
                        "Partner deactivation request was not found"
                ));
    }

    private User findUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(UserNotFoundException::new);
    }

    private String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Lý do không được để trống");
        }
        String normalized = reason.trim();
        if (normalized.length() > 500) {
            throw new IllegalArgumentException("Lý do tối đa 500 ký tự");
        }
        return normalized;
    }

    private BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private long nonZeroIssue(BigDecimal value) {
        return value.signum() != 0 ? 1 : 0;
    }

    private void addBlockers(LinkedHashSet<String> target, List<String> values) {
        if (values == null) {
            return;
        }
        values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .forEach(target::add);
    }

    private <T> T requiredTransactionResult(T result) {
        if (result == null) {
            throw new IllegalStateException("Transaction đổi vai trò không trả về kết quả");
        }
        return result;
    }
}
