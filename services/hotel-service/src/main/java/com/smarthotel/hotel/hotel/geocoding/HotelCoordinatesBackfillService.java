package com.smarthotel.hotel.hotel.geocoding;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.repository.HotelRepository;
import com.smarthotel.hotel.integration.geocoding.GeocodingAttempt;
import com.smarthotel.hotel.integration.geocoding.NominatimGeocodingClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class HotelCoordinatesBackfillService {

    private static final Logger log = LoggerFactory.getLogger(HotelCoordinatesBackfillService.class);

    private final HotelRepository hotelRepository;
    private final NominatimGeocodingClient geocodingClient;

    public HotelCoordinatesBackfillService(
            HotelRepository hotelRepository,
            NominatimGeocodingClient geocodingClient
    ) {
        this.hotelRepository = hotelRepository;
        this.geocodingClient = geocodingClient;
    }

    public BackfillSummary backfillNeverAttemptedMissingCoordinates() {
        List<Hotel> hotels = hotelRepository
                .findAllMissingCoordinatesNeverGeocoded();

        int success = 0;
        int notFound = 0;
        int unavailable = 0;

        for (Hotel hotel : hotels) {
            GeocodingAttempt attempt = geocodingClient.geocode(
                    hotel.getAddress(),
                    hotel.getWard(),
                    hotel.getDistrict(),
                    hotel.getCity()
            );

            switch (attempt.status()) {
                case SUCCESS -> {
                    hotel.applyGeocodingSuccess(
                            attempt.latitude(),
                            attempt.longitude(),
                            attempt.displayName()
                    );
                    hotelRepository.save(hotel);
                    success += 1;
                    log.info(
                            "Geocoded old hotel [{}] {} -> {}, {}",
                            hotel.getId(),
                            hotel.getName(),
                            attempt.latitude(),
                            attempt.longitude()
                    );
                }
                case NOT_FOUND -> {
                    hotel.markGeocodingNotFound();
                    hotelRepository.save(hotel);
                    notFound += 1;
                    log.warn(
                            "Could not geocode old hotel [{}] {} at {}",
                            hotel.getId(),
                            hotel.getName(),
                            hotel.getAddress()
                    );
                }
                case UNAVAILABLE, DISABLED -> {
                    unavailable += 1;
                    log.warn(
                            "Geocoding temporarily unavailable/disabled; stopping old-hotel backfill after [{}] {}",
                            hotel.getId(),
                            hotel.getName()
                    );
                    return new BackfillSummary(hotels.size(), success, notFound, unavailable);
                }
            }
        }

        return new BackfillSummary(hotels.size(), success, notFound, unavailable);
    }

    public record BackfillSummary(
            int candidates,
            int success,
            int notFound,
            int unavailable
    ) {
    }
}
