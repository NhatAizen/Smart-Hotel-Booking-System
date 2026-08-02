package com.smarthotel.notification.common.exception;

import com.smarthotel.notification.common.response.ApiErrorResponse;
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

    @ExceptionHandler(NotificationNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(
            NotificationNotFoundException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.NOT_FOUND,
                "NOTIFICATION_NOT_FOUND",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(MailDeliveryException.class)
    public ResponseEntity<ApiErrorResponse> handleMailDelivery(
            MailDeliveryException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.SERVICE_UNAVAILABLE,
                "MAIL_DELIVERY_FAILED",
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
                        "Request data is invalid",
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
                "Unexpected error at endpoint {}",
                request.getRequestURI(),
                exception
        );

        return build(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_SERVER_ERROR",
                "An unexpected system error occurred",
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