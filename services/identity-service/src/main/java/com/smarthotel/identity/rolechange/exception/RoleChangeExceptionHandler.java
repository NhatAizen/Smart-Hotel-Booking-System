package com.smarthotel.identity.rolechange.exception;

import com.smarthotel.identity.common.response.ApiErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class RoleChangeExceptionHandler {

    @ExceptionHandler(RoleChangeNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(
            RoleChangeNotFoundException exception,
            HttpServletRequest request
    ) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(
                ApiErrorResponse.of(
                        HttpStatus.NOT_FOUND.value(),
                        "ROLE_CHANGE_REQUEST_NOT_FOUND",
                        exception.getMessage(),
                        request.getRequestURI()
                )
        );
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiErrorResponse> handleAccessDenied(
            AccessDeniedException exception,
            HttpServletRequest request
    ) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(
                ApiErrorResponse.of(
                        HttpStatus.FORBIDDEN.value(),
                        "ACCESS_DENIED",
                        exception.getMessage(),
                        request.getRequestURI()
                )
        );
    }

    @ExceptionHandler(RoleChangeConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleConflict(
            RoleChangeConflictException exception,
            HttpServletRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(
                ApiErrorResponse.of(
                        HttpStatus.CONFLICT.value(),
                        "ROLE_CHANGE_CONFLICT",
                        exception.getMessage(),
                        request.getRequestURI()
                )
        );
    }

    @ExceptionHandler(RoleChangeDependencyException.class)
    public ResponseEntity<ApiErrorResponse> handleDependency(
            RoleChangeDependencyException exception,
            HttpServletRequest request
    ) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(
                ApiErrorResponse.of(
                        HttpStatus.SERVICE_UNAVAILABLE.value(),
                        "ROLE_CHANGE_DEPENDENCY_UNAVAILABLE",
                        exception.getMessage(),
                        request.getRequestURI()
                )
        );
    }
}
