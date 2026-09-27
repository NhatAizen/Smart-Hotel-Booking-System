package com.smarthotel.booking.booking.hold;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.booking.booking.dto.RoomHoldResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class RoomHoldService {

    private static final Logger log = LoggerFactory.getLogger(RoomHoldService.class);
    private static final String PREFIX = "enziu:booking:hold:";

    private static final DefaultRedisScript<Long> ACQUIRE_SCRIPT = new DefaultRedisScript<>(
            "for i,key in ipairs(KEYS) do "
                    + "local current = redis.call('get', key) "
                    + "if current and current ~= ARGV[1] then return 0 end "
                    + "end "
                    + "for i,key in ipairs(KEYS) do "
                    + "redis.call('psetex', key, ARGV[2], ARGV[1]) "
                    + "end return 1",
            Long.class
    );

    private static final DefaultRedisScript<Long> RELEASE_SCRIPT = new DefaultRedisScript<>(
            "local removed = 0 "
                    + "for i,key in ipairs(KEYS) do "
                    + "if redis.call('get', key) == ARGV[1] then "
                    + "removed = removed + redis.call('del', key) "
                    + "end end return removed",
            Long.class
    );

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final Duration holdTtl;

    public RoomHoldService(
            StringRedisTemplate redis,
            ObjectMapper objectMapper,
            @Value("${booking.hold.ttl-seconds:600}") long ttlSeconds
    ) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.holdTtl = Duration.ofSeconds(Math.max(30, ttlSeconds));
    }

    public Hold acquire(
            UUID bookingGroupId,
            UUID customerId,
            UUID hotelId,
            List<UUID> roomIds,
            LocalDate checkIn,
            LocalDate checkOut
    ) {
        if (roomIds == null || roomIds.isEmpty()) {
            throw new IllegalArgumentException("Phải có ít nhất một phòng để giữ");
        }

        String token = bookingGroupId.toString();
        List<String> keys = buildNightKeys(hotelId, roomIds, checkIn, checkOut);
        Instant expiresAt = Instant.now().plus(holdTtl);

        try {
            Long acquired = redis.execute(
                    ACQUIRE_SCRIPT,
                    keys,
                    token,
                    String.valueOf(holdTtl.toMillis())
            );
            if (!Long.valueOf(1L).equals(acquired)) {
                throw new RoomHoldConflictException(
                        "Một hoặc nhiều phòng vừa được khách khác giữ. Vui lòng chọn phòng khác."
                );
            }

            HoldMetadata metadata = new HoldMetadata(
                    token,
                    bookingGroupId,
                    customerId,
                    hotelId,
                    List.copyOf(roomIds),
                    checkIn,
                    checkOut,
                    expiresAt
            );
            String metadataKey = metadataKey(token);
            redis.opsForValue().set(metadataKey, writeMetadata(metadata), holdTtl);
            redis.opsForZSet().add(hotelIndexKey(hotelId), token, expiresAt.toEpochMilli());
            redis.expire(hotelIndexKey(hotelId), Duration.ofHours(2));

            return new Hold(metadata, keys);
        } catch (RoomHoldConflictException exception) {
            throw exception;
        } catch (Exception exception) {
            // Fail closed: nếu Redis không tạo được khóa thì không cho booking đi tiếp,
            // tránh double booking khi hệ thống đang lỗi hạ tầng.
            safeReleaseKeys(keys, token);
            throw new IllegalStateException(
                    "Không thể giữ phòng tạm thời. Vui lòng thử lại sau ít giây.",
                    exception
            );
        }
    }

    public Hold reuseExisting(
            UUID holdToken,
            UUID customerId,
            UUID hotelId,
            List<UUID> roomIds,
            LocalDate checkIn,
            LocalDate checkOut
    ) {
        if (holdToken == null) return null;
        HoldMetadata metadata = readMetadata(holdToken.toString());
        if (metadata == null || !metadata.expiresAt().isAfter(Instant.now())) {
            throw new RoomHoldConflictException(
                    "Thời gian giữ phòng đã hết. Vui lòng quay lại chọn phòng."
            );
        }

        List<UUID> expectedRooms = roomIds.stream().distinct()
                .sorted(Comparator.comparing(UUID::toString)).toList();
        List<UUID> actualRooms = metadata.roomIds().stream().distinct()
                .sorted(Comparator.comparing(UUID::toString)).toList();

        if (!metadata.customerId().equals(customerId)
                || !metadata.hotelId().equals(hotelId)
                || !actualRooms.equals(expectedRooms)
                || !metadata.checkIn().equals(checkIn)
                || !metadata.checkOut().equals(checkOut)) {
            throw new RoomHoldConflictException(
                    "Phiên giữ phòng không khớp với lựa chọn hiện tại."
            );
        }

        return new Hold(
                metadata,
                buildNightKeys(hotelId, roomIds, checkIn, checkOut)
        );
    }

    public void release(Hold hold) {
        if (hold == null) return;
        release(hold.metadata());
    }

    public void release(HoldMetadata metadata) {
        if (metadata == null) return;
        List<String> keys = buildNightKeys(
                metadata.hotelId(),
                metadata.roomIds(),
                metadata.checkIn(),
                metadata.checkOut()
        );
        safeReleaseKeys(keys, metadata.token());
        try {
            redis.delete(metadataKey(metadata.token()));
            redis.opsForZSet().remove(hotelIndexKey(metadata.hotelId()), metadata.token());
        } catch (Exception exception) {
            log.warn("Không thể dọn metadata room hold {}: {}", metadata.token(), exception.getMessage());
        }
    }

    public void releaseByBookingGroup(UUID bookingGroupId) {
        if (bookingGroupId == null) return;
        String token = bookingGroupId.toString();
        HoldMetadata metadata = readMetadata(token);
        if (metadata != null) {
            release(metadata);
        }
    }

    public List<RoomHoldResponse> findActiveHolds(
            UUID hotelId,
            LocalDate checkIn,
            LocalDate checkOut
    ) {
        return findActiveHolds(hotelId, checkIn, checkOut, null);
    }

    public List<CalendarHold> findActiveCalendarHolds(
            UUID hotelId,
            LocalDate rangeStart,
            LocalDate rangeEndExclusive
    ) {
        String indexKey = hotelIndexKey(hotelId);
        long now = Instant.now().toEpochMilli();
        try {
            redis.opsForZSet().removeRangeByScore(indexKey, 0, now);
            Set<String> tokens = redis.opsForZSet().rangeByScore(
                    indexKey,
                    now + 1,
                    Double.POSITIVE_INFINITY
            );
            if (tokens == null || tokens.isEmpty()) return List.of();

            List<CalendarHold> result = new ArrayList<>();
            for (String token : tokens) {
                HoldMetadata metadata = readCalendarMetadata(token);
                if (metadata == null) {
                    redis.opsForZSet().remove(indexKey, token);
                    continue;
                }
                if (!hotelId.equals(metadata.hotelId()) || !metadata.expiresAt().isAfter(Instant.now())) {
                    redis.opsForZSet().remove(indexKey, token);
                    continue;
                }
                if (!overlaps(
                        metadata.checkIn(), metadata.checkOut(),
                        rangeStart, rangeEndExclusive
                )) {
                    continue;
                }
                for (UUID roomId : metadata.roomIds()) {
                    result.add(new CalendarHold(
                            roomId,
                            metadata.checkIn(),
                            metadata.checkOut(),
                            metadata.expiresAt()
                    ));
                }
            }
            return List.copyOf(result);
        } catch (Exception exception) {
            log.warn(
                    "Không đọc được Redis room holds cho lịch khách sạn {}: {}",
                    hotelId,
                    exception.getMessage()
            );
            throw new IllegalStateException("Không thể đọc room holds cho lịch phòng", exception);
        }
    }

    public List<RoomHoldResponse> findActiveHolds(
            UUID hotelId,
            LocalDate checkIn,
            LocalDate checkOut,
            UUID ignoredHoldToken
    ) {
        String indexKey = hotelIndexKey(hotelId);
        long now = Instant.now().toEpochMilli();
        try {
            redis.opsForZSet().removeRangeByScore(indexKey, 0, now);
            Set<String> tokens = redis.opsForZSet().rangeByScore(
                    indexKey,
                    now + 1,
                    Double.POSITIVE_INFINITY
            );
            if (tokens == null || tokens.isEmpty()) return List.of();

            List<RoomHoldResponse> result = new ArrayList<>();
            for (String token : tokens) {
                HoldMetadata metadata = readMetadata(token);
                if (metadata == null) {
                    redis.opsForZSet().remove(indexKey, token);
                    continue;
                }
                if (ignoredHoldToken != null
                        && metadata.token().equals(ignoredHoldToken.toString())) {
                    continue;
                }
                if (!overlaps(metadata.checkIn(), metadata.checkOut(), checkIn, checkOut)) {
                    continue;
                }
                for (UUID roomId : metadata.roomIds()) {
                    result.add(new RoomHoldResponse(roomId, metadata.expiresAt()));
                }
            }
            return result;
        } catch (Exception exception) {
            log.warn("Không đọc được Redis room holds cho hotel {}: {}", hotelId, exception.getMessage());
            return List.of();
        }
    }

    public HoldMetadata getMetadata(UUID bookingGroupId) {
        return bookingGroupId == null ? null : readMetadata(bookingGroupId.toString());
    }

    public Duration getHoldTtl() {
        return holdTtl;
    }

    private HoldMetadata readMetadata(String token) {
        try {
            String json = redis.opsForValue().get(metadataKey(token));
            if (json == null || json.isBlank()) return null;
            return objectMapper.readValue(json, HoldMetadata.class);
        } catch (Exception exception) {
            log.warn("Không đọc được room hold metadata {}: {}", token, exception.getMessage());
            return null;
        }
    }

    private HoldMetadata readCalendarMetadata(String token) {
        try {
            String json = redis.opsForValue().get(metadataKey(token));
            return json == null || json.isBlank()
                    ? null
                    : objectMapper.readValue(json, HoldMetadata.class);
        } catch (Exception exception) {
            throw new IllegalStateException("Không thể đọc room hold metadata cho lịch phòng", exception);
        }
    }

    private String writeMetadata(HoldMetadata metadata) throws JsonProcessingException {
        return objectMapper.writeValueAsString(metadata);
    }

    private void safeReleaseKeys(List<String> keys, String token) {
        if (keys == null || keys.isEmpty()) return;
        try {
            redis.execute(RELEASE_SCRIPT, keys, token);
        } catch (Exception exception) {
            log.warn("Không thể release Redis room hold {}: {}", token, exception.getMessage());
        }
    }

    private List<String> buildNightKeys(
            UUID hotelId,
            List<UUID> roomIds,
            LocalDate checkIn,
            LocalDate checkOut
    ) {
        Set<String> keys = new LinkedHashSet<>();
        List<UUID> sortedRoomIds = roomIds.stream()
                .distinct()
                .sorted(Comparator.comparing(UUID::toString))
                .toList();
        for (UUID roomId : sortedRoomIds) {
            for (LocalDate date = checkIn; date.isBefore(checkOut); date = date.plusDays(1)) {
                keys.add(PREFIX + "hotel:" + hotelId + ":room:" + roomId + ":night:" + date);
            }
        }
        return List.copyOf(keys);
    }

    private String metadataKey(String token) {
        return PREFIX + "meta:" + token;
    }

    private String hotelIndexKey(UUID hotelId) {
        return PREFIX + "hotel-index:" + hotelId;
    }

    private boolean overlaps(
            LocalDate firstCheckIn,
            LocalDate firstCheckOut,
            LocalDate secondCheckIn,
            LocalDate secondCheckOut
    ) {
        return firstCheckIn.isBefore(secondCheckOut) && firstCheckOut.isAfter(secondCheckIn);
    }

    public record Hold(HoldMetadata metadata, List<String> keys) {
        public Instant expiresAt() {
            return metadata.expiresAt();
        }
    }

    public record HoldMetadata(
            String token,
            UUID bookingGroupId,
            UUID customerId,
            UUID hotelId,
            List<UUID> roomIds,
            LocalDate checkIn,
            LocalDate checkOut,
            Instant expiresAt
    ) {
    }

    public record CalendarHold(
            UUID roomId,
            LocalDate checkIn,
            LocalDate checkOut,
            Instant expiresAt
    ) {
    }

    public static class RoomHoldConflictException extends RuntimeException {
        public RoomHoldConflictException(String message) {
            super(message);
        }
    }
}
