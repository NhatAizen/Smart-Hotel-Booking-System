package com.smarthotel.payment.wallet.migration;

import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class PaymentV13MigrationContractTest {
    private static final String MIGRATION =
            "db/migration/V13__customer_wallet_financial_audit.sql";

    @Test
    void migrationIsStrictlyAdditiveAndContainsNoDestructiveStatement() throws Exception {
        String sql;
        try (InputStream input = getClass().getClassLoader().getResourceAsStream(MIGRATION)) {
            assertThat(input).as("V13 migration resource").isNotNull();
            sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }

        String statements = Arrays.stream(sql.split("\\R"))
                .map(line -> line.replaceFirst("--.*$", ""))
                .reduce("", (left, right) -> left + "\n" + right);

        assertThat(statements).doesNotContainPattern("(?i)\\bDROP\\b");
        assertThat(statements).doesNotContainPattern("(?i)\\bDELETE\\b");
        assertThat(statements).doesNotContainPattern("(?i)\\bUPDATE\\b");
        assertThat(statements).doesNotContainPattern("(?i)\\bTRUNCATE\\b");
        assertThat(statements).doesNotContainPattern("(?i)ALTER\\s+TABLE[\\s\\S]*?DROP");

        Arrays.stream(statements.split(";"))
                .map(String::trim)
                .filter(statement -> statement.toUpperCase().startsWith("ALTER TABLE"))
                .forEach(statement -> assertThat(statement)
                        .as("Every V13 ALTER TABLE is ADD COLUMN only")
                        .contains("ADD COLUMN")
                        .doesNotContain("DROP", "RENAME", "ALTER COLUMN"));
    }
}
