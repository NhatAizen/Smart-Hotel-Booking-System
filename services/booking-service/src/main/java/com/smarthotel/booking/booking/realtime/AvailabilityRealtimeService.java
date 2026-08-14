package com.smarthotel.booking.booking.realtime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AvailabilityRealtimeService {

    private static final Logger log = LoggerFactory.getLogger(AvailabilityRealtimeService.class);
    private static final long SSE_TIMEOUT_MS = 30L * 60L * 1000L;

    private final ConcurrentHashMap<UUID, Set<SseEmitter>> emittersByHotel = new ConcurrentHashMap<>();

    public SseEmitter subscribe(UUID hotelId) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        Set<SseEmitter> emitters = emittersByHotel.computeIfAbsent(
                hotelId,
                ignored -> ConcurrentHashMap.newKeySet()
        );
        emitters.add(emitter);

        Runnable cleanup = () -> remove(hotelId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(error -> cleanup.run());

        try {
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .reconnectTime(2000)
                    .data(Instant.now().toString()));
        } catch (IOException exception) {
            cleanup.run();
        }
        return emitter;
    }

    public void publish(AvailabilityEvent event) {
        if (event == null || event.hotelId() == null) return;
        Set<SseEmitter> emitters = emittersByHotel.get(event.hotelId());
        if (emitters == null || emitters.isEmpty()) return;

        for (SseEmitter emitter : Set.copyOf(emitters)) {
            try {
                emitter.send(SseEmitter.event()
                        .name("availability")
                        .id(UUID.randomUUID().toString())
                        .data(event));
            } catch (Exception exception) {
                remove(event.hotelId(), emitter);
            }
        }
    }

    @Scheduled(fixedRate = 20_000)
    public void heartbeat() {
        for (var entry : emittersByHotel.entrySet()) {
            UUID hotelId = entry.getKey();
            for (SseEmitter emitter : Set.copyOf(entry.getValue())) {
                try {
                    emitter.send(SseEmitter.event()
                            .name("heartbeat")
                            .data(Instant.now().toString()));
                } catch (Exception exception) {
                    remove(hotelId, emitter);
                }
            }
        }
    }

    private void remove(UUID hotelId, SseEmitter emitter) {
        Set<SseEmitter> emitters = emittersByHotel.get(hotelId);
        if (emitters == null) return;
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            emittersByHotel.remove(hotelId, emitters);
        }
    }
}
