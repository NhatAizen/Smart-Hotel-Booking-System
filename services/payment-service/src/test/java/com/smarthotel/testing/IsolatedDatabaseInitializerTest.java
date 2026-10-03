package com.smarthotel.testing;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import javax.sql.DataSource;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;

class IsolatedDatabaseInitializerTest {
    @ParameterizedTest
    @ValueSource(strings = {
            "jdbc:postgresql://localhost:5433/identity_db",
            "jdbc:postgresql://localhost:5434/hotel_db",
            "jdbc:postgresql://localhost:5435/booking_db",
            "jdbc:postgresql://localhost:5436/payment_db",
            "jdbc:postgresql://localhost:5437/notification_db",
            "jdbc:postgresql://localhost:5438/chat_db",
            "jdbc:postgresql://localhost:5434/hotel_test",
            "jdbc:postgresql://smart-hotel-hotel-postgres:5432/hotel_ci",
            "jdbc:postgresql://localhost:5432/hotel_db",
            "jdbc:postgresql://localhost:25432/hotel_ci?host=production",
            "jdbc:h2:file:./hotel_db"
    })
    void rejectsRuntimeDatasourceBeforeAnyDataSourceCreation(String url) {
        AtomicInteger created = new AtomicInteger();
        runner(created).withPropertyValues("spring.datasource.url=" + url).run(context -> {
            assertThat(context).hasFailed();
            assertThat(created).hasValue(0);
        });
    }

    @Test
    void missingDatasourceFailsBeforeAnyDataSourceCreation() {
        AtomicInteger created = new AtomicInteger();
        runner(created).run(context -> {
            assertThat(context).hasFailed();
            assertThat(created).hasValue(0);
        });
    }

    @Test
    void runtimeCredentialsAreRejected() {
        assertThatThrownBy(() -> IsolatedDatabaseInitializer.validate(
                "jdbc:postgresql://localhost:25432/hotel_ci", "hotel_user"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void alternateFlywayDatasourceIsRejectedBeforeConnection() {
        AtomicInteger created = new AtomicInteger();
        runner(created).withPropertyValues(
                "spring.datasource.url=jdbc:postgresql://localhost:25432/hotel_ci",
                "spring.flyway.url=jdbc:postgresql://localhost:5434/hotel_db")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(created).hasValue(0);
                });
    }

    @Test
    void explicitIsolatedDatabaseUsesFreshTestJwtInsteadOfInheritedSecret() {
        AtomicInteger created = new AtomicInteger();
        runner(created).withPropertyValues(
                "spring.datasource.url=jdbc:postgresql://localhost:25432/hotel_ci",
                "JWT_SECRET=inherited-secret-must-not-be-used")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(created).hasValue(1);
                    String key = context.getEnvironment().getRequiredProperty("security.jwt.secret");
                    assertThat(Base64.getDecoder().decode(key)).hasSize(32);
                    assertThat(key).isNotEqualTo("inherited-secret-must-not-be-used");
                    assertThat(context.getEnvironment().getProperty("app.jwt.secret")).isEqualTo(key);
                });
        assertThatCode(() -> IsolatedDatabaseInitializer.validate(
                "jdbc:postgresql://localhost:5432/hotel_daily_ci", "ci_daily"))
                .doesNotThrowAnyException();
    }

    @Test
    void existingInMemoryWalletUnitFixtureIsAllowedWithoutNetworkOrFlyway() {
        AtomicInteger created = new AtomicInteger();
        runner(created).withPropertyValues(
                "spring.datasource.url=jdbc:h2:mem:hotel_wallet_transfer;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
                "spring.datasource.username=sa", "spring.datasource.password=", "spring.flyway.enabled=false")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(created).hasValue(1);
                });
    }

    private ApplicationContextRunner runner(AtomicInteger created) {
        return new ApplicationContextRunner().withInitializer(new IsolatedDatabaseInitializer())
                .withPropertyValues("spring.datasource.username=ci_security",
                        "spring.datasource.password=synthetic-test-only")
                .withBean(DataSource.class, () -> {
                    created.incrementAndGet();
                    return mock(DataSource.class);
                });
    }
}
