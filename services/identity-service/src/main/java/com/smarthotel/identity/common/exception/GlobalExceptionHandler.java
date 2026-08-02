package com.smarthotel.identity.common.exception;

import com.smarthotel.identity.common.response.ApiErrorResponse;
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

    @ExceptionHandler(EmailAlreadyExistsException.class)
    public ResponseEntity<ApiErrorResponse> handleEmailAlreadyExists(
            EmailAlreadyExistsException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.CONFLICT,
                "EMAIL_ALREADY_EXISTS",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidCredentials(
            InvalidCredentialsException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.UNAUTHORIZED,
                "INVALID_CREDENTIALS",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(InvalidAccountTokenException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidAccountToken(
            InvalidAccountTokenException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.BAD_REQUEST,
                "INVALID_ACCOUNT_TOKEN",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(MailDeliveryException.class)
    public ResponseEntity<ApiErrorResponse> handleMailDelivery(
            MailDeliveryException exception,
            HttpServletRequest request
    ) {
        LOGGER.error(
                "Không thể gửi email tại endpoint {}",
                request.getRequestURI(),
                exception
        );

        return build(
                HttpStatus.SERVICE_UNAVAILABLE,
                "MAIL_DELIVERY_FAILED",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(InvalidRefreshTokenException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidRefreshToken(
            InvalidRefreshTokenException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.UNAUTHORIZED,
                "INVALID_REFRESH_TOKEN",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(CurrentPasswordInvalidException.class)
    public ResponseEntity<ApiErrorResponse> handleCurrentPasswordInvalid(
            CurrentPasswordInvalidException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.BAD_REQUEST,
                "CURRENT_PASSWORD_INVALID",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleUserNotFound(
            UserNotFoundException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.NOT_FOUND,
                "USER_NOT_FOUND",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalArgument(
            IllegalArgumentException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.BAD_REQUEST,
                "INVALID_ARGUMENT",
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
                        "Dữ liệu gửi lên không hợp lệ",
                        request.getRequestURI(),
                        errors
                );

        return ResponseEntity
                .badRequest()
                .body(response);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(
            Exception exception,
            HttpServletRequest request
    ) {
        LOGGER.error(
                "Lỗi không mong muốn tại endpoint {}",
                request.getRequestURI(),
                exception
        );

        return build(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_SERVER_ERROR",
                "Hệ thống xảy ra lỗi không mong muốn",
                request
        );
    }

    private ResponseEntity<ApiErrorResponse> build(
            HttpStatus status,
            String code,
            String message,
            HttpServletRequest request
    ) {
        ApiErrorResponse response =
                ApiErrorResponse.of(
                        status.value(),
                        code,
                        message,
                        request.getRequestURI()
                );

        return ResponseEntity
                .status(status)
                .body(response);
    }
}