package com.smarthotel.booking.common.exception;

import com.smarthotel.booking.common.response.ApiErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BookingNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleBookingNotFound(
            BookingNotFoundException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.NOT_FOUND,
                "BOOKING_NOT_FOUND",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(RoomAlreadyBookedException.class)
    public ResponseEntity<ApiErrorResponse> handleRoomAlreadyBooked(
            RoomAlreadyBookedException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.CONFLICT,
                "ROOM_ALREADY_BOOKED",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler({
            IllegalArgumentException.class,
            IllegalStateException.class
    })
    public ResponseEntity<ApiErrorResponse> handleBadRequest(
            RuntimeException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.BAD_REQUEST,
                "INVALID_BOOKING_OPERATION",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        Map<String, String> errors = new LinkedHashMap<>();

        exception.getBindingResult()
                .getFieldErrors()
                .forEach(error ->
                        errors.putIfAbsent(
                                error.getField(),
                                error.getDefaultMessage()
                        )
                );

        ApiErrorResponse response =
                ApiErrorResponse.validation(
                        HttpStatus.BAD_REQUEST.value(),
                        "VALIDATION_ERROR",
                        "Dá»¯ liá»‡u gá»­i lÃªn khÃ´ng há»£p lá»‡",
                        request.getRequestURI(),
                        errors
                );

        return ResponseEntity.badRequest().body(response);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(
            Exception exception,
            HttpServletRequest request
    ) {
        LOGGER.error(
                "Lá»—i khÃ´ng mong muá»‘n táº¡i endpoint {}",
                request.getRequestURI(),
                exception
        );

        return build(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_SERVER_ERROR",
                "Há»‡ thá»‘ng xáº£y ra lá»—i khÃ´ng mong muá»‘n",
                request
        );
    }

    private ResponseEntity<ApiErrorResponse> build(
            HttpStatus status,
            String code,
            String message,
            HttpServletRequest request
    ) {
        return ResponseEntity
                .status(status)
                .body(
                        ApiErrorResponse.of(
                                status.value(),
                                code,
                                message,
                                request.getRequestURI()
                        )
                );
    }
}