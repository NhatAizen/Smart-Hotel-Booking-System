package com.smarthotel.booking.booking.dto;

import com.smarthotel.booking.booking.entity.PaymentOption;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

public record CreateBookingRequest(
        @NotNull UUID customerId,
        @NotNull UUID hotelId,
        @NotNull UUID roomId,
        @NotNull @FutureOrPresent LocalDate checkIn,
        @NotNull LocalDate checkOut,
        @NotNull @Min(1) Integer adults,
        @NotNull @Min(0) Integer children,
        @NotNull PaymentOption paymentOption,
        @NotBlank @Size(max = 100) String bookerLastName,
        @NotBlank @Size(max = 100) String bookerFirstName,
        @NotBlank @Email @Size(max = 255) String bookerEmail,
        @NotBlank @Size(min = 8, max = 30) String bookerPhone,
        @NotNull LocalDate bookerDateOfBirth,
        @AssertTrue boolean ageConfirmed,
        boolean bookerIsGuest,
        @Size(max = 100) String guestLastName,
        @Size(max = 100) String guestFirstName,
        @Size(max = 30) String guestPhone,
        @Size(max = 1000) String specialRequest,
        boolean invoiceRequested,
        @Size(max = 255) String invoiceCompanyName,
        @Size(max = 50) String invoiceTaxCode,
        @Size(max = 500) String invoiceAddress,
        @Email @Size(max = 255) String invoiceEmail,
        @AssertTrue boolean termsAccepted
) {
    public CreateBookingBatchRequest toBatch() {
        return new CreateBookingBatchRequest(
                customerId, hotelId, java.util.List.of(roomId), checkIn, checkOut,
                adults, children, paymentOption, bookerLastName, bookerFirstName,
                bookerEmail, bookerPhone, bookerDateOfBirth, ageConfirmed,
                bookerIsGuest, guestLastName,
                guestFirstName, guestPhone, specialRequest, invoiceRequested,
                invoiceCompanyName, invoiceTaxCode, invoiceAddress, invoiceEmail,
                termsAccepted, null, null, null
        );
    }
}
