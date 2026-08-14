package com.smarthotel.identity.rolechange.exception;

public class RoleChangeDependencyException extends RuntimeException {

    public RoleChangeDependencyException(String message) {
        super(message);
    }

    public RoleChangeDependencyException(String message, Throwable cause) {
        super(message, cause);
    }
}
