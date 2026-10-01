package com.smarthotel.booking.booking.roomchange.financial;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:room_change_outbox;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(RoomChangeFinancialOutboxService.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class RoomChangeFinancialOutboxServiceTest {
    @Autowired RoomChangeFinancialOutboxService service;
    @Autowired RoomChangeFinancialOutboxRepository repository;
    @Autowired TransactionTemplate transactionTemplate;

    @Test
    void eventCommitsWithSuccessfulBookingTransaction() {
        UUID roomChangeId = UUID.randomUUID();
        transactionTemplate.executeWithoutResult(status -> service.enqueue(
                roomChangeId, UUID.randomUUID(), UUID.randomUUID(),
                new BigDecimal("600000"), new BigDecimal("800000"), 1L
        ));

        assertThat(repository.findById(roomChangeId)).isPresent()
                .get().extracting(RoomChangeFinancialOutboxEvent::getStatus)
                .isEqualTo("PENDING");
    }

    @Test
    void bookingTransactionRollbackLeavesNoFinancialEvent() {
        UUID roomChangeId = UUID.randomUUID();
        transactionTemplate.executeWithoutResult(status -> {
            service.enqueue(roomChangeId, UUID.randomUUID(), UUID.randomUUID(),
                    new BigDecimal("600000"), new BigDecimal("800000"), 1L);
            status.setRollbackOnly();
        });

        assertThat(repository.findById(roomChangeId)).isEmpty();
    }

    @Test
    void publisherSelectionExposesOnlyTheNextVersionForEachBooking() {
        UUID bookingId = UUID.randomUUID();
        transactionTemplate.executeWithoutResult(status -> {
            service.enqueue(UUID.randomUUID(), bookingId, UUID.randomUUID(),
                    new BigDecimal("600000"), new BigDecimal("800000"), 1L);
            service.enqueue(UUID.randomUUID(), bookingId, UUID.randomUUID(),
                    new BigDecimal("800000"), new BigDecimal("600000"), 2L);
        });

        transactionTemplate.executeWithoutResult(status -> {
            var firstBatch = repository.lockNextBatch();
            assertThat(firstBatch).singleElement()
                    .extracting(RoomChangeFinancialOutboxEvent::getRoomChangeVersion)
                    .isEqualTo(1L);
            firstBatch.get(0).markPublished();
        });

        transactionTemplate.executeWithoutResult(status ->
                assertThat(repository.lockNextBatch()).singleElement()
                        .extracting(RoomChangeFinancialOutboxEvent::getRoomChangeVersion)
                        .isEqualTo(2L)
        );
    }
}
