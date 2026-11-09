package com.smarthotel.ai.assistant.v2.service;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.assertj.core.api.Assertions.*;

class OptionReferencesTest {
    @ParameterizedTest
    @CsvSource(delimiter='|', value={
        "so sánh cho tôi khách sạn 1,3|A,C",
        "So sánh 3 với 1|C,A",
        "Đối chiếu khách sạn số 2 và số 3|B,C",
        "So sánh khách sạn thứ nhất với khách sạn thứ ba|A,C",
        "So sanh 1 & 3|A,C",
        "Khách sạn đầu tiên và cuối cùng khác gì nhau?|A,D",
        "So sánh hai khách sạn đầu tiên|A,B",
        "So sánh 3 khách sạn đầu tiên|A,B,C",
        "So sánh cả 3 khách sạn xem|A,B,C",
        "Đối chiếu cả ba lựa chọn|A,B,C",
        "So sánh 2 khách sạn 1 và 3|A,C",
        "So sánh lựa chọn thứ tư và thứ hai|D,B"
    })
    void resolvesDisplayedPositionsInRequestedOrder(String question,String expected) {
        assertThat(OptionReferences.resolve(OptionReferences.positions(question), List.of("A","B","C","D")))
                .containsExactly(expected.split(","));
    }

    @Test
    void countsPricesDatesAndStarRatingsDoNotSelectAnOrdinal() {
        for (String question : List.of("So sánh khách sạn 3 sao và 4 sao", "So sánh giá 1,3 triệu", "So sánh giá ngày 28/10/2026"))
            assertThat(OptionReferences.positions(question)).as(question).isEmpty();
        assertThat(OptionReferences.positions("từ khách sạn Gia Định Park Hotel đến nhà ga T2")).isEmpty();
    }

    @Test
    void invalidOrAbsentRosterNeverSelectsADifferentOption() {
        assertThat(OptionReferences.resolve(OptionReferences.positions("So sánh 1,9"),List.of("A","B","C"))).isEmpty();
        assertThat(OptionReferences.resolve(OptionReferences.positions("So sánh 0,3"),List.of("A","B","C"))).isEmpty();
        assertThat(OptionReferences.resolve(OptionReferences.positions("So sánh 1,3"),List.of())).isEmpty();
        assertThat(OptionReferences.resolve(OptionReferences.positions("So sánh 1,1"),List.of("A","B","C"))).containsExactly("A");
    }
    @Test
    void allBenefitsIsADimensionRequestNotAChangeToTheComparedRoster() {
        assertThat(OptionReferences.wholeRoster("So sánh tất cả lợi ích của hai khách sạn này")).isFalse();
        assertThat(OptionReferences.wholeRoster("So sánh cả ba khách sạn")).isTrue();
    }
}
