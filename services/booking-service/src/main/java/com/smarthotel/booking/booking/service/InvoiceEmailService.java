package com.smarthotel.booking.booking.service;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

@Service
public class InvoiceEmailService {
    private static final Logger LOGGER = LoggerFactory.getLogger(InvoiceEmailService.class);
    private final BookingRepository repository;
    private final HotelClient hotelClient;
    private final NotificationClient notificationClient;

    public InvoiceEmailService(BookingRepository repository, HotelClient hotelClient,
                               NotificationClient notificationClient) {
        this.repository = repository;
        this.hotelClient = hotelClient;
        this.notificationClient = notificationClient;
    }

    // Read committed bookings only; SMTP failures never undo or block the checkout response.
    @Scheduled(initialDelayString = "${booking.invoice.initial-delay-ms:15000}",
            fixedDelayString = "${booking.invoice.retry-delay-ms:30000}")
    public void sendPendingInvoices() {
        for (Booking booking : repository.findPendingInvoiceEmails()) {
            try {
                String hotelName = hotelClient.getHotel(booking.getHotelId()).name();
                UUID deliveryId = UUID.nameUUIDFromBytes(
                        ("booking-invoice:" + booking.getId()).getBytes(StandardCharsets.UTF_8));
                notificationClient.sendInvoice(deliveryId, booking.getCustomerId(), booking.getInvoiceEmail(),
                        "Thông tin hóa đơn đặt phòng " + booking.getBookingCode() + " | EnziuRooms",
                        content(booking, hotelName), "/customer/bookings#booking-" + booking.getId());
                repository.markInvoiceEmailSent(booking.getId(), Instant.now());
            } catch (RuntimeException exception) {
                LOGGER.warn("Invoice email for booking {} will be retried ({})",
                        booking.getId(), exception.getClass().getSimpleName());
            }
        }
    }

    static String content(Booking booking, String hotelName) {
        var date = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        String paymentMethod = switch (booking.getPaymentOption()) {
            case PAY_AT_HOTEL -> "Thanh toán tại khách sạn";
            case DEPOSIT -> "Đặt cọc trước, thanh toán phần còn lại tại khách sạn";
            case FULL_PAYMENT -> "Thanh toán toàn bộ";
        };
        return """
                THÔNG TIN HÓA ĐƠN ĐẶT PHÒNG

                Mã đặt phòng: %s
                Khách sạn: %s
                Nhận phòng: %s
                Trả phòng: %s

                THÔNG TIN XUẤT HÓA ĐƠN
                Tên công ty: %s
                Mã số thuế: %s
                Địa chỉ công ty: %s
                Email nhận hóa đơn: %s

                CHI TIẾT THANH TOÁN
                Phương thức: %s
                Tiền phòng trước ưu đãi: %s
                Giảm giá: %s
                Tổng tiền đặt phòng: %s
                Đã thanh toán: %s
                Còn phải thanh toán: %s

                Yêu cầu xuất hóa đơn của bạn đã được ghi nhận cùng đơn đặt phòng.
                Email này cung cấp thông tin đặt phòng và thanh toán; hóa đơn thuế do khách sạn phát hành.

                Cảm ơn bạn đã đặt phòng cùng EnziuRooms.
                """.formatted(booking.getBookingCode(), hotelName,
                date.format(booking.getCheckIn()), date.format(booking.getCheckOut()),
                booking.getInvoiceCompanyName(), booking.getInvoiceTaxCode(), booking.getInvoiceAddress(),
                booking.getInvoiceEmail(), paymentMethod, money(booking.getGrossAmount()),
                money(booking.getTotalDiscountAmount()), money(booking.getTotalPrice()),
                money(booking.getPaidAmount()), money(booking.getRemainingAmount()));
    }

    private static String money(BigDecimal amount) {
        return NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN"))
                .format(amount == null ? BigDecimal.ZERO : amount) + " đ";
    }
}
