package com.smarthotel.identity.oauth.service;

import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import com.smarthotel.identity.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.UUID;

@Service
public class CustomOAuth2UserService
        extends DefaultOAuth2UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public CustomOAuth2UserService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public OAuth2User loadUser(
            OAuth2UserRequest userRequest
    ) throws OAuth2AuthenticationException {

        OAuth2User oauth2User =
                super.loadUser(userRequest);

        String registrationId =
                userRequest
                        .getClientRegistration()
                        .getRegistrationId();

        /*
         * Service này dành cho Facebook.
         * Google đã được CustomOidcUserService xử lý.
         */
        if (
                !"facebook".equalsIgnoreCase(
                        registrationId
                )
        ) {
            return oauth2User;
        }

        String email = normalizeEmail(
                oauth2User.getAttribute("email")
        );

        String fullName = normalizeName(
                oauth2User.getAttribute("name")
        );

        if (email == null || email.isBlank()) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error(
                            "facebook_email_not_found"
                    ),
                    "Facebook không cung cấp email. "
                            + "Hãy bảo đảm tài khoản Facebook có email "
                            + "và ứng dụng đã được cấp quyền email."
            );
        }

        User user = userRepository
                .findByEmailIgnoreCase(email)
                .orElseGet(() ->
                        createFacebookUser(
                                email,
                                fullName
                        )
                );

        if (!user.isActive()) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error(
                            "account_disabled"
                    ),
                    "Tài khoản EnziuRooms đã bị vô hiệu hóa"
            );
        }

        /*
         * Người dùng đã chứng minh quyền sở hữu tài khoản
         * thông qua Facebook OAuth.
         */
        if (!user.isEmailVerified()) {
            user.verifyEmail();
        }

        return oauth2User;
    }

    private User createFacebookUser(
            String email,
            String fullName
    ) {
        String randomPassword =
                UUID.randomUUID()
                        + "-"
                        + UUID.randomUUID();

        User user = new User(
                email,
                passwordEncoder.encode(
                        randomPassword
                ),
                fullName,
                UserRole.CUSTOMER
        );

        user.verifyEmail();

        return userRepository.save(user);
    }

    private String normalizeEmail(
            Object value
    ) {
        if (value == null) {
            return null;
        }

        String email =
                value.toString().trim();

        if (email.isBlank()) {
            return null;
        }

        return email.toLowerCase(
                Locale.ROOT
        );
    }

    private String normalizeName(
            Object value
    ) {
        if (value == null) {
            return "Khách hàng EnziuRooms";
        }

        String name =
                value.toString().trim();

        if (name.isBlank()) {
            return "Khách hàng EnziuRooms";
        }

        return name;
    }
}