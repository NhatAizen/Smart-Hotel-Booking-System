package com.smarthotel.hotel.hotel.geocoding;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class HotelCoordinatesBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(HotelCoordinatesBackfillRunner.class);

    private final HotelCoordinatesBackfillService backfillService;

    public HotelCoordinatesBackfillRunner(
            HotelCoordinatesBackfillService backfillService
    ) {
        this.backfillService = backfillService;
    }

    @Override
    public void run(ApplicationArguments args) {
        HotelCoordinatesBackfillService.BackfillSummary summary =
                backfillService.backfillNeverAttemptedMissingCoordinates();

        if (summary.candidates() > 0) {
            log.info(
                    "Old hotel coordinate backfill completed: candidates={}, success={}, notFound={}, unavailable={}",
                    summary.candidates(),
                    summary.success(),
                    summary.notFound(),
                    summary.unavailable()
            );
        }
    }
}
