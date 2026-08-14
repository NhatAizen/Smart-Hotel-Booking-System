package com.smarthotel.hotel.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class CurrentRoleFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void allowsOnlyWhenTokenRoleMatchesCurrentRole() throws Exception {
        Fixture fixture = fixture();
        authenticate("HOTEL_ADMIN");
        fixture.server().expect(once(), requestTo(
                        "http://identity.test/api/users/me/role-snapshot"
                ))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer test-token"))
                .andRespond(withSuccess(
                        "{\"role\":\"HOTEL_ADMIN\",\"active\":true}",
                        MediaType.APPLICATION_JSON
                ));
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        fixture.filter().doFilter(
                new MockHttpServletRequest("GET", "/api/hotels/mine"),
                response,
                chain
        );

        fixture.server().verify();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void rejectsStaleRoleBeforeRequestReachesController() throws Exception {
        Fixture fixture = fixture();
        authenticate("HOTEL_ADMIN");
        fixture.server().expect(once(), requestTo(
                        "http://identity.test/api/users/me/role-snapshot"
                ))
                .andRespond(withSuccess(
                        "{\"role\":\"CUSTOMER\",\"active\":true}",
                        MediaType.APPLICATION_JSON
                ));
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        fixture.filter().doFilter(
                new MockHttpServletRequest("PUT", "/api/hotels/one"),
                response,
                chain
        );

        fixture.server().verify();
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void failsClosedWhenIdentityServiceIsUnavailable() throws Exception {
        Fixture fixture = fixture();
        authenticate("HOTEL_ADMIN");
        fixture.server().expect(once(), requestTo(
                        "http://identity.test/api/users/me/role-snapshot"
                ))
                .andRespond(withServerError());
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        fixture.filter().doFilter(
                new MockHttpServletRequest("POST", "/api/hotels"),
                response,
                chain
        );

        fixture.server().verify();
        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(chain.getRequest()).isNull();
    }

    private Fixture fixture() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        return new Fixture(
                new CurrentRoleFilter(builder, "http://identity.test", true),
                server
        );
    }

    private void authenticate(String role) {
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .subject(UUID.randomUUID().toString())
                .claim("role", role)
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(
                        jwt,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role))
                )
        );
    }

    private record Fixture(
            CurrentRoleFilter filter,
            MockRestServiceServer server
    ) {
    }
}
