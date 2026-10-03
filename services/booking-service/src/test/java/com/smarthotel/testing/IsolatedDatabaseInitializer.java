package com.smarthotel.testing;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.Ordered;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

/**
 * Test-classpath only. Runs before bean creation, including DataSource/Flyway.
 * Each independently built service carries this same guard (no runtime dependency).
 */
public final class IsolatedDatabaseInitializer
        implements ApplicationContextInitializer<ConfigurableApplicationContext>, Ordered {
    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    @Override
    public void initialize(ConfigurableApplicationContext context) {
        var environment = context.getEnvironment();
        String url = environment.getRequiredProperty("spring.datasource.url");
        String user = environment.getRequiredProperty("spring.datasource.username");
        environment.getRequiredProperty("spring.datasource.password");
        // Allow only disposable in-memory H2 fixtures with Flyway disabled; never file/TCP/INIT URLs.
        boolean embeddedH2Fixture = url.matches(
                "^jdbc:h2:mem:[a-z0-9_]+;MODE=PostgreSQL;DB_CLOSE_DELAY=-1$")
                && user.equals("sa") && !environment.getProperty("spring.flyway.enabled", Boolean.class, true);
        if (!embeddedH2Fixture) validate(url, user);
        String flywayUrl = environment.getProperty("spring.flyway.url");
        if (flywayUrl != null && !flywayUrl.equals(url)) {
            throw new IllegalStateException("TEST ISOLATION: separate Flyway datasource forbidden");
        }
        String flywayUser = environment.getProperty("spring.flyway.user");
        if (flywayUser != null && !flywayUser.equals(user)) {
            throw new IllegalStateException("TEST ISOLATION: separate Flyway credentials forbidden");
        }
        // Never inherit a production JWT, even if it is present in the developer shell.
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        String testKey = Base64.getEncoder().encodeToString(key);
        environment.getPropertySources().addFirst(new MapPropertySource("isolated-test-jwt",
                Map.of("JWT_SECRET", testKey, "security.jwt.secret", testKey, "app.jwt.secret", testKey)));
        if (embeddedH2Fixture) {
            System.out.println("TEST ISOLATION verified embedded H2 fixture; Flyway disabled");
            return;
        }
        URI parsed = URI.create(url.substring("jdbc:".length()));
        System.out.printf("TEST ISOLATION verified host=%s port=%d database=%s%n",
                parsed.getHost(), parsed.getPort(), parsed.getPath().substring(1));
    }

    public static void validate(String url, String user) {
        if (url == null || !url.startsWith("jdbc:postgresql://")) {
            throw new IllegalStateException("TEST ISOLATION: explicit isolated PostgreSQL URL required");
        }
        final URI parsed;
        try {
            parsed = URI.create(url.substring("jdbc:".length()));
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("TEST ISOLATION: invalid datasource URL");
        }
        String host = parsed.getHost();
        String database = parsed.getPath() == null ? "" : parsed.getPath().substring(1);
        int port = parsed.getPort();
        boolean isolatedPort = port == 5432 || (port >= 10000 && port <= 65535);
        boolean loopback = "localhost".equals(host) || "127.0.0.1".equals(host);
        if (!loopback || !isolatedPort || !database.matches("[a-z0-9_]+_(ci|test)")
                || parsed.getUserInfo() != null || parsed.getQuery() != null
                || parsed.getFragment() != null || user == null
                || !user.matches("(ci|test)_[a-z0-9_]+")) {
            // Deliberately do not include supplied URLs/credentials in failure messages.
            throw new IllegalStateException("TEST ISOLATION: runtime/production datasource rejected");
        }
    }
}
