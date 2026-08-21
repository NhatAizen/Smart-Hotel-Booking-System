package com.smarthotel.identity.common.exception;

public class LoginTemporarilyLockedException extends RuntimeException {

    private final long retryAfterSeconds;

    public LoginTemporarilyLockedException(long retryAfterSeconds) {
        super("Bạn đã nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau.");
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
