package com.smarthotel.payment.payment.service;

import com.smarthotel.payment.common.exception.DuplicateTransactionCodeException;
import com.smarthotel.payment.common.exception.PaymentNotFoundException;
import com.smarthotel.payment.integration.booking.BookingClient;
import com.smarthotel.payment.payment.dto.CompletePaymentRequest;
import com.smarthotel.payment.payment.dto.CreatePaymentRequest;
import com.smarthotel.payment.payment.dto.FailPaymentRequest;
import com.smarthotel.payment.payment.dto.PaymentResponse;
import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final BookingClient bookingClient;

    public PaymentService(
            PaymentRepository paymentRepository,
            BookingClient bookingClient
    ) {
        this.paymentRepository = paymentRepository;
        this.bookingClient = bookingClient;
    }

    @Transactional
    public PaymentResponse create(
            CreatePaymentRequest request
    ) {
        Payment payment = new Payment(
                request.bookingId(),
                request.customerId(),
                request.amount(),
                request.method()
        );

        return PaymentResponse.from(
                paymentRepository.save(payment)
        );
    }

    @Transactional(readOnly = true)
    public PaymentResponse getById(UUID paymentId) {
        return PaymentResponse.from(
                findPayment(paymentId)
        );
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> getByBooking(
            UUID bookingId
    ) {
        return paymentRepository
                .findAllByBookingIdOrderByCreatedAtDesc(bookingId)
                .stream()
                .map(PaymentResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> getByCustomer(
            UUID customerId
    ) {
        return paymentRepository
                .findAllByCustomerIdOrderByCreatedAtDesc(customerId)
                .stream()
                .map(PaymentResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> getByStatus(
            PaymentStatus status
    ) {
        return paymentRepository
                .findAllByStatusOrderByCreatedAtDesc(status)
                .stream()
                .map(PaymentResponse::from)
                .toList();
    }

    @Transactional
    public PaymentResponse complete(
            UUID paymentId,
            CompletePaymentRequest request
    ) {
        String transactionCode =
                request.transactionCode().trim();

        if (paymentRepository.existsByTransactionCode(
                transactionCode
        )) {
            throw new DuplicateTransactionCodeException(
                    transactionCode
            );
        }

        Payment payment = findPayment(paymentId);

        // Chỉ payment PENDING mới được chuyển thành PAID.
        payment.markPaid(transactionCode);

        // Thanh toán thành công thì xác nhận booking.
        bookingClient.confirmBooking(
                payment.getBookingId()
        );

        return PaymentResponse.from(payment);
    }

    @Transactional
    public PaymentResponse fail(
            UUID paymentId,
            FailPaymentRequest request
    ) {
        Payment payment = findPayment(paymentId);

        payment.markFailed(
                request.failureReason().trim()
        );

        return PaymentResponse.from(payment);
    }

    @Transactional
    public PaymentResponse refund(UUID paymentId) {
        Payment payment = findPayment(paymentId);

        /*
         * Payment phải đang PAID.
         * Nếu trạng thái không hợp lệ, Payment.refund()
         * sẽ ném lỗi và booking không bị hủy.
         */
        payment.refund();

        /*
         * Hoàn tiền thành công:
         * CONFIRMED -> CANCELLED.
         *
         * Booking CANCELLED sẽ không còn được tính
         * khi kiểm tra trùng lịch phòng.
         */
        bookingClient.cancelBooking(
                payment.getBookingId()
        );

        return PaymentResponse.from(payment);
    }

    private Payment findPayment(UUID paymentId) {
        return paymentRepository
                .findById(paymentId)
                .orElseThrow(
                        () -> new PaymentNotFoundException(
                                paymentId
                        )
                );
    }
}