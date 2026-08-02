package com.smarthotel.hotel.common.exception;

import com.smarthotel.hotel.common.response.ApiErrorResponse;
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

    @ExceptionHandler(HotelNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleHotelNotFound(
            HotelNotFoundException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.NOT_FOUND,
                "HOTEL_NOT_FOUND",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(RoomTypeNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleRoomTypeNotFound(
            RoomTypeNotFoundException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.NOT_FOUND,
                "ROOM_TYPE_NOT_FOUND",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(RoomNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleRoomNotFound(
            RoomNotFoundException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.NOT_FOUND,
                "ROOM_NOT_FOUND",
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler({
            DuplicateRoomTypeNameException.class,
            DuplicateRoomNumberException.class
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
