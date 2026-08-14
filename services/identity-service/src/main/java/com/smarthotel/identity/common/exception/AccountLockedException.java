package com.smarthotel.identity.common.exception;

public class AccountLockedException extends RuntimeException {

    public AccountLockedException() {
        super("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên hệ thống.");
    }
}
