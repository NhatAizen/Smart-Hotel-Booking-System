package com.smarthotel.identity.oauth.controller;

import com.smarthotel.identity.auth.dto.AuthResponse;
import com.smarthotel.identity.oauth.dto.OAuth2CodeExchangeRequest;
import com.smarthotel.identity.oauth.service.OAuth2AuthorizationCodeService;
import com.smarthotel.identity.security.JwtService;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.repository.UserRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth/oauth2")
public class OAuth2AuthController {

    private final OAuth2AuthorizationCodeService codeService;
    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;

    public OAuth2AuthController(
            OAuth2AuthorizationCodeService codeService,
            UserRepository userRepository,
            JwtService jwtService,
            RefreshTokenService refreshTokenService
    ) {
        this.codeService = codeService;
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
    }

    @PostMapping("/exchange")
    public AuthResponse exchange(
            @Valid @RequestBody OAuth2CodeExchangeRequest request
    ) {
        UUID userId = codeService.consume(request.code());

        User user = userRepository
                .findById(userId)
                .filter(User::isActive)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Tài khoản không tồn tại hoặc đã bị vô hiệu hóa"
                ));

        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = refreshTokenService.issue(user);

        return AuthResponse.loggedIn(
                user,
                accessToken,
                refreshToken,
                jwtService.getExpirationSeconds()
        );
    }
}
