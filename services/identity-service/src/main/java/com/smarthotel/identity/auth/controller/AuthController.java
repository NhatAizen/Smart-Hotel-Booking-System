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
                API Ä‘Äƒng kÃ½, Ä‘Äƒng nháº­p, JWT, refresh token,
                Ä‘Äƒng xuáº¥t, xÃ¡c thá»±c email vÃ  Ä‘áº·t láº¡i máº­t kháº©u
                """
)
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @Operation(
            summary = "ÄÄƒng kÃ½ tÃ i khoáº£n",
            description = """
                    Tạo tài khoản khách hàng mới. Email là tùy chọn; nếu có email,
                    hệ thống sẽ gửi liên kết xác thực. Tài khoản mới mặc định có role CUSTOMER.
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
            summary = "ÄÄƒng nháº­p",
            description = """
                    Kiểm tra tên đăng nhập/email và mật khẩu.
                    Sai quá nhiều lần sẽ khóa đăng nhập tạm thời theo thời gian tăng dần.
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
            summary = "LÃ m má»›i token",
            description = """
                    Sá»­ dá»¥ng refresh token hiá»‡n táº¡i Ä‘á»ƒ táº¡o access token má»›i
                    vÃ  refresh token má»›i theo cÆ¡ cháº¿ Refresh Token Rotation.
                    Refresh token cÅ© sáº½ bá»‹ thu há»“i.
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
            summary = "ÄÄƒng xuáº¥t má»™t phiÃªn",
            description = """
                    Thu há»“i refresh token Ä‘Æ°á»£c gá»­i lÃªn.
                    Access token hiá»‡n táº¡i váº«n cÃ²n hiá»‡u lá»±c Ä‘áº¿n khi háº¿t háº¡n.
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
            summary = "ÄÄƒng xuáº¥t táº¥t cáº£ thiáº¿t bá»‹",
            description = """
                    Thu há»“i toÃ n bá»™ refresh token cá»§a ngÆ°á»i dÃ¹ng hiá»‡n táº¡i.
                    API nÃ y yÃªu cáº§u Bearer access token há»£p lá»‡.
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
            summary = "XÃ¡c thá»±c email",
            description = """
                    XÃ¡c thá»±c email báº±ng token nháº­n Ä‘Æ°á»£c trong email.
                    Token chá»‰ Ä‘Æ°á»£c sá»­ dá»¥ng má»™t láº§n vÃ  cÃ³ thá»i háº¡n.
                    """
    )
    @GetMapping("/verify-email")
    public ResponseEntity<MessageResponse> verifyEmail(
            @RequestParam
            @NotBlank(message = "Token khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng")
            String token
    ) {
        return ResponseEntity.ok(
                authService.verifyEmail(token)
        );
    }

    @Operation(
            summary = "Gá»­i láº¡i email xÃ¡c thá»±c",
            description = """
                    Gá»­i láº¡i email xÃ¡c thá»±c náº¿u tÃ i khoáº£n tá»“n táº¡i,
                    Ä‘ang hoáº¡t Ä‘á»™ng vÃ  chÆ°a xÃ¡c thá»±c email.
                    Response khÃ´ng tiáº¿t lá»™ email cÃ³ tá»“n táº¡i hay khÃ´ng.
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
            summary = "QuÃªn máº­t kháº©u",
            description = """
                    Gá»­i email chá»©a token Ä‘áº·t láº¡i máº­t kháº©u.
                    Response khÃ´ng tiáº¿t lá»™ email cÃ³ tá»“n táº¡i hay khÃ´ng.
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
            summary = "Äáº·t láº¡i máº­t kháº©u",
            description = """
                    Äáº·t máº­t kháº©u má»›i báº±ng token nháº­n Ä‘Æ°á»£c trong email.
                    Token chá»‰ dÃ¹ng má»™t láº§n. Sau khi thÃ nh cÃ´ng,
                    toÃ n bá»™ refresh token cá»§a tÃ i khoáº£n sáº½ bá»‹ thu há»“i.
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