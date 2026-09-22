package com.smarthotel.booking.booking.hold;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.ZSetOperations;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RoomHoldCalendarTest {
    @Mock StringRedisTemplate redis;
    @Mock ZSetOperations<String, String> zset;
    @Mock ValueOperations<String, String> values;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final UUID hotelId = UUID.randomUUID();
    private final UUID roomId = UUID.randomUUID();
    private final LocalDate start = LocalDate.of(2026, 9, 19);

    @Test
    void returnsOnlyActiveOverlappingHoldsWithCheckoutExclusive() throws Exception {
        String first = UUID.randomUUID().toString();
        String checkoutDay = UUID.randomUUID().toString();
        String expired = UUID.randomUUID().toString();
        when(redis.opsForZSet()).thenReturn(zset);
        when(redis.opsForValue()).thenReturn(values);
        when(zset.rangeByScore(anyString(), anyDouble(), anyDouble()))
                .thenReturn(Set.of(first, checkoutDay, expired));
        when(values.get("enziu:booking:hold:meta:" + first))
                .thenReturn(json(first, hotelId, start, start.plusDays(2), Instant.now().plusSeconds(60)));
        when(values.get("enziu:booking:hold:meta:" + checkoutDay))
                .thenReturn(json(checkoutDay, hotelId, start.minusDays(2), start, Instant.now().plusSeconds(60)));
        when(values.get("enziu:booking:hold:meta:" + expired))
                .thenReturn(json(expired, hotelId, start, start.plusDays(1), Instant.now().minusSeconds(1)));

        var holds = new RoomHoldService(redis, mapper, 600)
                .findActiveCalendarHolds(hotelId, start, start.plusDays(7));

        assertThat(holds).singleElement().satisfies(hold -> {
            assertThat(hold.roomId()).isEqualTo(roomId);
            assertThat(hold.checkOut()).isEqualTo(start.plusDays(2));
        });
    }

    @Test
    void failsCalendarReadWhenRedisUnavailableInsteadOfShowingRoomsAsFree() {
        when(redis.opsForZSet()).thenThrow(new IllegalStateException("Redis unavailable"));

        assertThatThrownBy(() -> new RoomHoldService(redis, mapper, 600)
                .findActiveCalendarHolds(hotelId, start, start.plusDays(7)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Không thể đọc room holds");
    }

    private String json(String token, UUID ownerHotel, LocalDate checkIn,
                        LocalDate checkOut, Instant expiresAt) throws Exception {
        UUID groupId = UUID.fromString(token);
        return mapper.writeValueAsString(new RoomHoldService.HoldMetadata(
                token, groupId, UUID.randomUUID(), ownerHotel, List.of(roomId),
                checkIn, checkOut, expiresAt));
    }
}
