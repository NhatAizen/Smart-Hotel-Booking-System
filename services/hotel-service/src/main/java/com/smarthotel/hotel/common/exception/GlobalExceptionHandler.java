package com.smarthotel.hotel.common.exception;

import com.smarthotel.hotel.common.response.ApiErrorResponse;
import com.smarthotel.hotel.rolechange.fence.OwnerDemotionFenceException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler({
            HotelNotFoundException.class,
            RoomTypeNotFoundException.class,
            RoomNotFoundException.class
    })
    public ResponseEntity<ApiErrorResponse> handleNotFound(
            RuntimeException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.NOT_FOUND,
                "RESOURCE_NOT_FOUND",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler({
            DuplicateRoomTypeNameException.class,
            DuplicateRoomNumberException.class,
            OwnerDemotionFenceException.class
    })
    public ResponseEntity<ApiErrorResponse> handleConflict(
            RuntimeException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.CONFLICT,
                "RESOURCE_ALREADY_EXISTS",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiErrorResponse> handleAccessDenied(
            AccessDeniedException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.FORBIDDEN,
                "ACCESS_DENIED",
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
                .forEach(error -> errors.putIfAbsent(
                        error.getField(),
                        error.getDefaultMessage()
                ));

        return ResponseEntity.badRequest().body(
                ApiErrorResponse.validation(
                        HttpStatus.BAD_REQUEST.value(),
                        "VALIDATION_ERROR",
                        "Dữ liệu gửi lên không hợp lệ",
                        request.getRequestURI(),
                        errors
                )
        );
    }

    @ExceptionHandler({
            IllegalArgumentException.class,
            IllegalStateException.class
    })
    public ResponseEntity<ApiErrorResponse> handleBusinessError(
            RuntimeException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.BAD_REQUEST,
                "BUSINESS_ERROR",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiErrorResponse> handleMaxUpload(
            MaxUploadSizeExceededException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "FILE_TOO_LARGE",
                "Tệp tải lên vượt quá giới hạn cho phép",
                request
        );
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
        return ResponseEntity.status(status).body(
                ApiErrorResponse.of(
                        status.value(),
                        code,
                        message,
                        request.getRequestURI()
                )
        );
    }
}
