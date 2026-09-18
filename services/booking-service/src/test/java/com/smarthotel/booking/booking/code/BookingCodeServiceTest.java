package com.smarthotel.booking.booking.code;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BookingCodeServiceTest {
    @ParameterizedTest
    @CsvSource({
            "Aura Luxury Hotel, ALH",
            "Aurora Saigon. Hotel., ASH",
            "Khách sạn Đà Nẵng, KSDN",
            "Đà Lạt Hotel, DLH"
    })
    void abbreviatesHotelNames(String name, String expected) {
        assertThat(BookingCodeService.buildPrefix(name)).isEqualTo(expected);
    }

    @Test
    void resumesStoredCounterAndKeepsHotelsIndependent() {
        var repository = mock(BookingCodeSequenceRepository.class);
        UUID firstHotel = UUID.randomUUID();
        UUID secondHotel = UUID.randomUUID();
        var existingSequence = new BookingCodeSequence(firstHotel, "ASH");
        existingSequence.nextNumber();
        when(repository.findForUpdate(firstHotel)).thenReturn(Optional.of(existingSequence));
        when(repository.findForUpdate(secondHotel))
                .thenReturn(Optional.of(new BookingCodeSequence(secondHotel, "ALH")));

        assertThat(new BookingCodeService(repository).nextCode(firstHotel, "Aurora Saigon Hotel"))
                .isEqualTo("ASH-02");
        assertThat(new BookingCodeService(repository).nextCode(secondHotel, "Aura Luxury Hotel"))
                .isEqualTo("ALH-01");
        assertThat(new BookingCodeService(repository).nextCode(firstHotel, "Aurora Saigon Hotel"))
                .isEqualTo("ASH-03");
    }
}
