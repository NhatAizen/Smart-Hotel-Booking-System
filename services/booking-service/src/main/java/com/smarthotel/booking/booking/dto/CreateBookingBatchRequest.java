package com.smarthotel.booking.booking.dto;

import com.smarthotel.booking.booking.entity.PaymentOption;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CreateBookingBatchRequest(
        @NotNull(message = "Customer ID không được để trống")
        UUID customerId,

        @NotNull(message = "Hotel ID không được để trống")
        UUID hotelId,

        @NotEmpty(message = "Phải chọn ít nhất một phòng")
        @Size(max = 10, message = "Mỗi lần chỉ được đặt tối đa 10 phòng")
        List<@NotNull UUID> roomIds,

        @NotNull(message = "Ngày nhận phòng không được để trống")
        @FutureOrPresent(message = "Ngày nhận phòng không được ở quá khứ")
        LocalDate checkIn,

        @NotNull(message = "Ngày trả phòng không được để trống")
        LocalDate checkOut,

        @NotNull(message = "Số người lớn không được để trống")
        @Min(value = 1, message = "Phải có ít nhất một người lớn")
        Integer adults,

        @NotNull(message = "Số trẻ em không được để trống")
        @Min(value = 0, message = "Số trẻ em không được âm")
        Integer children,

        @NotNull(message = "Phương thức thanh toán không được để trống")
        PaymentOption paymentOption,

        @NotBlank(message = "Họ người đặt không được để trống")
        @Size(max = 100, message = "Họ người đặt tối đa 100 ký tự")
        String bookerLastName,

        @NotBlank(message = "Tên người đặt không được để trống")
        @Size(max = 100, message = "Tên người đặt tối đa 100 ký tự")
        String bookerFirstName,

        @NotBlank(message = "Email người đặt không được để trống")
        @Email(message = "Email người đặt không hợp lệ")
        @Size(max = 255, message = "Email tối đa 255 ký tự")
        String bookerEmail,

        @NotBlank(message = "Số điện thoại người đặt không được để trống")
        @Size(min = 8, max = 30, message = "Số điện thoại phải từ 8 đến 30 ký tự")
        String bookerPhone,

        @NotNull(message = "Ngày sinh người đứng tên đặt phòng không được để trống")
        LocalDate bookerDateOfBirth,

        @AssertTrue(message = "Bạn phải xác nhận người đứng tên đặt phòng đã đủ 18 tuổi")
        boolean ageConfirmed,

        boolean bookerIsGuest,

        @Size(max = 100, message = "Họ khách lưu trú tối đa 100 ký tự")
        String guestLastName,

        @Size(max = 100, message = "Tên khách lưu trú tối đa 100 ký tự")
        String guestFirstName,

        @Size(max = 30, message = "Số điện thoại khách lưu trú tối đa 30 ký tự")
        String guestPhone,

        @Size(max = 1000, message = "Yêu cầu đặc biệt tối đa 1000 ký tự")
        String specialRequest,

        boolean invoiceRequested,

        @Size(max = 255, message = "Tên công ty tối đa 255 ký tự")
        String invoiceCompanyName,

        @Size(max = 50, message = "Mã số thuế tối đa 50 ký tự")
        String invoiceTaxCode,

        @Size(max = 500, message = "Địa chỉ công ty tối đa 500 ký tự")
        String invoiceAddress,

        @Email(message = "Email nhận hóa đơn không hợp lệ")
        @Size(max = 255, message = "Email nhận hóa đơn tối đa 255 ký tự")
        String invoiceEmail,

        @AssertTrue(message = "Bạn phải đồng ý điều khoản và chính sách đặt phòng")
        boolean termsAccepted,

        UUID holdToken,

        @Size(max = 40, message = "Mã ưu đãi khách sạn tối đa 40 ký tự")
        String hotelPromotionCode,

        @Size(max = 40, message = "Mã ưu đãi EnziuRooms tối đa 40 ký tự")
        String platformPromotionCode
) {
}
