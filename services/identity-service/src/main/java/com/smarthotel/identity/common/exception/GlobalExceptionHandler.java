package com.smarthotel.identity.common.exception;

import com.smarthotel.identity.common.response.ApiErrorResponse;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycVerificationException;
import com.smarthotel.identity.partnerrequest.ocr.PartnerOcrVerificationException;
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


    @ExceptionHandler(UsernameAlreadyExistsException.class)
    public ResponseEntity<ApiErrorResponse> handleUsernameAlreadyExists(
            UsernameAlreadyExistsException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.CONFLICT,
                "USERNAME_ALREADY_EXISTS",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(LoginTemporarilyLockedException.class)
    public ResponseEntity<ApiErrorResponse> handleLoginTemporarilyLocked(
            LoginTemporarilyLockedException exception,
            HttpServletRequest request
    ) {
        ApiErrorResponse response = ApiErrorResponse.retryAfter(
                HttpStatus.TOO_MANY_REQUESTS.value(),
                "LOGIN_TEMPORARILY_LOCKED",
                exception.getMessage(),
                request.getRequestURI(),
                exception.getRetryAfterSeconds()
        );

        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(exception.getRetryAfterSeconds()))
                .body(response);
    }

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


    @ExceptionHandler(AccountDeletedException.class)
    public ResponseEntity<ApiErrorResponse> handleAccountDeleted(
            AccountDeletedException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.GONE,
                "ACCOUNT_DELETED",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(AccountLockedException.class)
    public ResponseEntity<ApiErrorResponse> handleAccountLocked(
            AccountLockedException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.LOCKED,
                "ACCOUNT_LOCKED",
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
                "KhÃ´ng thá»ƒ gá»­i email táº¡i endpoint {}",
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

    @ExceptionHandler(PartnerEkycVerificationException.class)
    public ResponseEntity<ApiErrorResponse> handlePartnerEkycVerification(
            PartnerEkycVerificationException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "PARTNER_EKYC_VERIFICATION_FAILED",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(PartnerOcrVerificationException.class)
    public ResponseEntity<ApiErrorResponse> handlePartnerOcrVerification(
            PartnerOcrVerificationException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "CCCD_OCR_VERIFICATION_FAILED",
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
                        "Dá»¯ liá»‡u gá»­i lÃªn khÃ´ng há»£p lá»‡",
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