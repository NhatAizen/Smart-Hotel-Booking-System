package com.smarthotel.identity.auth.controller;

import com.smarthotel.identity.auth.dto.AuthResponse;
import com.smarthotel.identity.auth.dto.EmailRequest;
import com.smarthotel.identity.auth.dto.LoginRequest;
import com.smarthotel.identity.auth.dto.RefreshTokenRequest;
import com.smarthotel.identity.auth.dto.RegisterRequest;
import com.smarthotel.identity.auth.dto.ResetPasswordRequest;
import com.smarthotel.identity.auth.service.AuthService;
import com.smarthotel.identity.common.response.MessageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@Validated
@RestController
@RequestMapping("/api/auth")
@Tag(
        name = "Authentication",
        description = """
                API đăng ký, đăng nhập, JWT, refresh token,
                đăng xuất, xác thực email và đặt lại mật khẩu
                """
)
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @Operation(
            summary = "Đăng ký tài khoản",
            description = """
                    Tạo tài khoản khách hàng mới và gửi email xác thực.
                    Tài khoản mới mặc định có role CUSTOMER.
                    """
    )
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(
            @Valid @RequestBody RegisterRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(authService.register(request));
    }

    @Operation(
            summary = "Đăng nhập",
            description = """
                    Kiểm tra email và mật khẩu.
                    Trả về JWT access token và refresh token nếu hợp lệ.
                    """
    )
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest request
    ) {
        return ResponseEntity.ok(
                authService.login(request)
        );
    }

    @Operation(
            summary = "Làm mới token",
            description = """
                    Sử dụng refresh token hiện tại để tạo access token mới
                    và refresh token mới theo cơ chế Refresh Token Rotation.
                    Refresh token cũ sẽ bị thu hồi.
                    """
    )
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @Valid @RequestBody RefreshTokenRequest request
    ) {
        return ResponseEntity.ok(
                authService.refresh(request)
        );
    }

    @Operation(
            summary = "Đăng xuất một phiên",
            description = """
                    Thu hồi refresh token được gửi lên.
                    Access token hiện tại vẫn còn hiệu lực đến khi hết hạn.
                    """
    )
    @PostMapping("/logout")
    public ResponseEntity<MessageResponse> logout(
            @Valid @RequestBody RefreshTokenRequest request
    ) {
        return ResponseEntity.ok(
                authService.logout(request)
        );
    }

    @Operation(
            summary = "Đăng xuất tất cả thiết bị",
            description = """
                    Thu hồi toàn bộ refresh token của người dùng hiện tại.
                    API này yêu cầu Bearer access token hợp lệ.
                    """
    )
    @PostMapping("/logout-all")
    public ResponseEntity<MessageResponse> logoutAll(
            @AuthenticationPrincipal Jwt jwt
    ) {
        UUID userId = UUID.fromString(
                jwt.getSubject()
        );

        return ResponseEntity.ok(
                authService.logoutAll(userId)
        );
    }

    @Operation(
            summary = "Xác thực email",
            description = """
                    Xác thực email bằng token nhận được trong email.
                    Token chỉ được sử dụng một lần và có thời hạn.
                    """
    )
    @GetMapping("/verify-email")
    public ResponseEntity<MessageResponse> verifyEmail(
            @RequestParam
            @NotBlank(message = "Token không được để trống")
            String token
    ) {
        return ResponseEntity.ok(
                authService.verifyEmail(token)
        );
    }

    @Operation(
            summary = "Gửi lại email xác thực",
            description = """
                    Gửi lại email xác thực nếu tài khoản tồn tại,
                    đang hoạt động và chưa xác thực email.
                    Response không tiết lộ email có tồn tại hay không.
                    """
    )
    @PostMapping("/resend-verification")
    public ResponseEntity<MessageResponse> resendVerification(
            @Valid @RequestBody EmailRequest request
    ) {
        return ResponseEntity.ok(
                authService.resendVerification(request)
        );
    }

    @Operation(
            summary = "Quên mật khẩu",
            description = """
                    Gửi email chứa token đặt lại mật khẩu.
                    Response không tiết lộ email có tồn tại hay không.
                    """
    )
    @PostMapping("/forgot-password")
    public ResponseEntity<MessageResponse> forgotPassword(
            @Valid @RequestBody EmailRequest request
    ) {
        return ResponseEntity.ok(
                authService.forgotPassword(request)
        );
    }

    @Operation(
            summary = "Đặt lại mật khẩu",
            description = """
                    Đặt mật khẩu mới bằng token nhận được trong email.
                    Token chỉ dùng một lần. Sau khi thành công,
                    toàn bộ refresh token của tài khoản sẽ bị thu hồi.
                    """
    )
    @PostMapping("/reset-password")
    public ResponseEntity<MessageResponse> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request
    ) {
        return ResponseEntity.ok(
                authService.resetPassword(request)
        );
    }
}