package com.smarthotel.identity.common.exception;

public class AccountDeletedException extends RuntimeException {

    public AccountDeletedException() {
        super("Tài khoản đã bị xóa và không thể đăng nhập. Vui lòng liên hệ quản trị viên hệ thống.");
    }
}
