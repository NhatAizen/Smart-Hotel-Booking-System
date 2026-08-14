package com.smarthotel.identity.oauth.service;

import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import com.smarthotel.identity.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.UUID;

@Service
public class CustomOidcUserService extends OidcUserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public CustomOidcUserService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public OidcUser loadUser(OidcUserRequest userRequest)
            throws OAuth2AuthenticationException {

        OidcUser oidcUser = super.loadUser(userRequest);
        String email = normalizeEmail(oidcUser.getEmail());
        String fullName = resolveFullName(oidcUser);

        if (email == null || email.isBlank()) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("email_not_found"),
                    "Google không cung cấp địa chỉ email"
            );
        }

        if (!Boolean.TRUE.equals(oidcUser.getEmailVerified())) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("email_not_verified"),
                    "Email Google chưa được xác minh"
            );
        }

        User user = userRepository
                .findByEmailIgnoreCase(email)
                .orElseGet(() -> createGoogleUser(email, fullName));

        if (!user.isActive()) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("account_disabled"),
                    "Tài khoản EnziuRooms đã bị vô hiệu hóa"
            );
        }

        if (!user.isEmailVerified()) {
            user.verifyEmail();
        }

        return oidcUser;
    }

    private User createGoogleUser(String email, String fullName) {
        String randomPassword = UUID.randomUUID() + "-" + UUID.randomUUID();

        User user = new User(
                email,
                passwordEncoder.encode(randomPassword),
                fullName,
                UserRole.CUSTOMER
        );

        user.verifyEmail();
        return userRepository.save(user);
    }

    private String resolveFullName(OidcUser oidcUser) {
        String name = oidcUser.getFullName();

        if (name == null || name.isBlank()) {
            name = oidcUser.getGivenName();
        }

        if (name == null || name.isBlank()) {
            name = "Khách hàng EnziuRooms";
        }

        return name.trim();
    }

    private String normalizeEmail(String email) {
        if (email == null) {
            return null;
        }

        return email.trim().toLowerCase(Locale.ROOT);
    }
}
