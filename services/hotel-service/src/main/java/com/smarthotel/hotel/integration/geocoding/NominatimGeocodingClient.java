package com.smarthotel.hotel.integration.geocoding;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class NominatimGeocodingClient {

    private static final Logger log = LoggerFactory.getLogger(NominatimGeocodingClient.class);

    private static final Set<String> ADMIN_STOP_WORDS = Set.of(
            "duong", "street", "phuong", "ward", "xa", "commune",
            "quan", "district", "huyen", "county", "thanh", "pho", "city",
            "tp", "viet", "nam", "vietnam"
    );

    private final NominatimProperties properties;
    private final RestClient restClient;
    private final Object rateLimitLock = new Object();
    private final Map<String, GeocodingAttempt> requestCache = new ConcurrentHashMap<>();
    private long lastRequestAt = 0L;

    public NominatimGeocodingClient(NominatimProperties properties) {
        this.properties = properties;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.connectTimeoutMs());
        requestFactory.setReadTimeout(properties.readTimeoutMs());

        this.restClient = RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory)
                .defaultHeader("User-Agent", properties.userAgent())
                .defaultHeader("Accept-Language", "vi,en;q=0.8")
                .build();
    }

    public GeocodingAttempt geocode(
            String address,
            String ward,
            String district,
            String city
    ) {
        if (!properties.enabled()) {
            return GeocodingAttempt.disabled();
        }

        List<String> candidates = buildCandidates(address, ward, district, city);
        if (candidates.isEmpty()) {
            return GeocodingAttempt.notFound();
        }

        SearchContext context = buildSearchContext(address, ward, district, city);

        try {
            for (String query : candidates) {
                GeocodingAttempt attempt = searchBest(query, context);
                if (attempt.successful()) {
                    return attempt;
                }
                if (attempt.status() == GeocodingAttempt.Status.UNAVAILABLE) {
                    return attempt;
                }
            }
            return GeocodingAttempt.notFound();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return GeocodingAttempt.unavailable();
        }
    }

    private GeocodingAttempt searchBest(
            String query,
            SearchContext context
    ) throws InterruptedException {
        String cacheKey = normalizeForComparison(query)
                + "|" + String.join("-", context.streetTokens())
                + "|" + String.join("-", context.districtTokens())
                + "|" + String.join("-", context.cityTokens());

        GeocodingAttempt cached = requestCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        waitForRateLimit();

        try {
            JsonNode response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/search")
                            .queryParam("format", "jsonv2")
                            .queryParam("q", query)
                            .queryParam("limit", 8)
                            .queryParam("countrycodes", "vn")
                            .queryParam("addressdetails", 1)
                            .queryParam("dedupe", 1)
                            .build())
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(JsonNode.class);

            if (response == null || !response.isArray() || response.isEmpty()) {
                GeocodingAttempt notFound = GeocodingAttempt.notFound();
                requestCache.put(cacheKey, notFound);
                return notFound;
            }

            List<ScoredMatch> matches = new ArrayList<>();
            for (JsonNode match : response) {
                ScoredMatch scored = scoreMatch(match, context);
                if (scored != null) {
                    matches.add(scored);
                }
            }

            ScoredMatch best = matches.stream()
                    .max(Comparator.comparingInt(ScoredMatch::score))
                    .orElse(null);

            if (best == null) {
                log.info("Nominatim returned results for [{}] but none matched street/city context", query);
                GeocodingAttempt notFound = GeocodingAttempt.notFound();
                requestCache.put(cacheKey, notFound);
                return notFound;
            }

            GeocodingAttempt success = GeocodingAttempt.success(
                    best.latitude(),
                    best.longitude(),
                    best.displayName()
            );
            requestCache.put(cacheKey, success);
            return success;
        } catch (RestClientException exception) {
            log.warn("Nominatim request failed for query [{}]: {}", query, exception.getMessage());
            return GeocodingAttempt.unavailable();
        }
    }

    private ScoredMatch scoreMatch(JsonNode match, SearchContext context) {
        double latitude = match.path("lat").asDouble(Double.NaN);
        double longitude = match.path("lon").asDouble(Double.NaN);
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) {
            return null;
        }

        String displayName = match.path("display_name").asText("");
        JsonNode addressNode = match.path("address");
        String searchable = normalizeForComparison(
                displayName + " "
                        + addressNode.path("road").asText("") + " "
                        + addressNode.path("pedestrian").asText("") + " "
                        + addressNode.path("neighbourhood").asText("") + " "
                        + addressNode.path("suburb").asText("") + " "
                        + addressNode.path("quarter").asText("") + " "
                        + addressNode.path("city_district").asText("") + " "
                        + addressNode.path("district").asText("") + " "
                        + addressNode.path("county").asText("") + " "
                        + addressNode.path("city").asText("") + " "
                        + addressNode.path("state").asText("")
        );

        // A hotel must at least resolve to the requested street. This prevents
        // Nominatim's first fuzzy result from silently placing it in another area.
        if (!context.streetTokens().isEmpty()
                && !containsAllTokens(searchable, context.streetTokens())) {
            return null;
        }

        // When a city is provided, reject results outside that city/province.
        if (!context.cityTokens().isEmpty()
                && !containsAllTokens(searchable, context.cityTokens())) {
            return null;
        }

        int score = 10;

        if (!context.districtTokens().isEmpty()
                && containsAllTokens(searchable, context.districtTokens())) {
            score += 8;
        }

        if (!context.wardTokens().isEmpty()
                && containsAllTokens(searchable, context.wardTokens())) {
            score += 4;
        }

        String expectedHouseNumber = context.houseNumber();
        String actualHouseNumber = normalizeForComparison(addressNode.path("house_number").asText(""));
        if (expectedHouseNumber != null && expectedHouseNumber.equals(actualHouseNumber)) {
            score += 5;
        }

        String type = normalizeForComparison(match.path("type").asText(""));
        if (type.equals("road") || type.equals("residential") || type.equals("pedestrian")) {
            score += 2;
        }

        return new ScoredMatch(latitude, longitude, displayName, score);
    }

    private boolean containsAllTokens(String searchable, List<String> tokens) {
        if (tokens.isEmpty()) {
            return true;
        }

        Set<String> haystack = new LinkedHashSet<>(Arrays.asList(searchable.split("\\s+")));
        return tokens.stream().allMatch(haystack::contains);
    }

    private void waitForRateLimit() throws InterruptedException {
        synchronized (rateLimitLock) {
            long elapsed = System.currentTimeMillis() - lastRequestAt;
            long remaining = properties.minIntervalMs() - elapsed;
            if (remaining > 0) {
                Thread.sleep(remaining);
            }
            lastRequestAt = System.currentTimeMillis();
        }
    }

    private List<String> buildCandidates(
            String address,
            String ward,
            String district,
            String city
    ) {
        String cleanAddress = clean(address);
        String cleanWard = clean(ward);
        String cleanDistrict = clean(district);
        String cleanCity = clean(city);

        if (cleanAddress == null && cleanCity == null) {
            return List.of();
        }

        Set<String> candidates = new LinkedHashSet<>();

        String exact = joinWithoutContainedDuplicates(
                cleanAddress,
                cleanWard,
                cleanDistrict,
                cleanCity,
                "Việt Nam"
        );
        addCandidate(candidates, exact);

        String districtLevel = joinWithoutContainedDuplicates(
                cleanAddress,
                cleanDistrict,
                cleanCity,
                "Việt Nam"
        );
        addCandidate(candidates, districtLevel);

        String streetOnly = stripLeadingHouseNumber(firstAddressSegment(cleanAddress));
        if (streetOnly != null) {
            String relaxed = joinWithoutContainedDuplicates(
                    streetOnly,
                    cleanWard,
                    cleanDistrict,
                    cleanCity,
                    "Việt Nam"
            );
            addCandidate(candidates, relaxed);

            String relaxedWithoutWard = joinWithoutContainedDuplicates(
                    streetOnly,
                    cleanDistrict,
                    cleanCity,
                    "Việt Nam"
            );
            addCandidate(candidates, relaxedWithoutWard);
        }

        return new ArrayList<>(candidates);
    }

    private void addCandidate(Set<String> candidates, String candidate) {
        if (candidate != null && !candidate.isBlank()) {
            candidates.add(candidate);
        }
    }

    private String joinWithoutContainedDuplicates(String... parts) {
        List<String> result = new ArrayList<>();
        StringBuilder searchable = new StringBuilder();

        for (String part : parts) {
            if (part == null || part.isBlank()) {
                continue;
            }

            String normalizedPart = normalizeForComparison(part);
            String normalizedCurrent = normalizeForComparison(searchable.toString());
            if (!normalizedCurrent.contains(normalizedPart)) {
                result.add(part);
                if (!searchable.isEmpty()) {
                    searchable.append(", ");
                }
                searchable.append(part);
            }
        }

        return String.join(", ", result);
    }

    private String firstAddressSegment(String value) {
        if (value == null) {
            return null;
        }
        int comma = value.indexOf(',');
        return comma >= 0 ? value.substring(0, comma).trim() : value.trim();
    }

    private String stripLeadingHouseNumber(String value) {
        if (value == null) {
            return null;
        }
        String stripped = value.replaceFirst(
                "^\\s*\\d+[A-Za-z]?(?:[/\\-]\\d+[A-Za-z]?)?\\s+",
                ""
        ).trim();
        return stripped.isBlank() ? value : stripped;
    }

    private String extractHouseNumber(String value) {
        if (value == null) {
            return null;
        }
        String first = firstAddressSegment(value);
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("^\\s*(\\d+[A-Za-z]?(?:[/\\-]\\d+[A-Za-z]?)?)\\b")
                .matcher(first == null ? "" : first);
        return matcher.find() ? normalizeForComparison(matcher.group(1)) : null;
    }

    private List<String> meaningfulTokens(String value) {
        String normalized = normalizeForComparison(value);
        if (normalized.isBlank()) {
            return List.of();
        }

        return Arrays.stream(normalized.split("\\s+"))
                .filter(token -> token.length() >= 1)
                .filter(token -> !ADMIN_STOP_WORDS.contains(token))
                .distinct()
                .toList();
    }

    private String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().replaceAll("\\s+", " ");
    }

    private String normalizeForComparison(String value) {
        String normalized = Normalizer.normalize(
                value == null ? "" : value,
                Normalizer.Form.NFD
        ).replaceAll("\\p{M}", "");

        return normalized
                .toLowerCase(Locale.ROOT)
                .replace('đ', 'd')
                .replaceAll("[^a-z0-9]+", " ")
                .trim();
    }

    private SearchContext buildSearchContext(
            String address,
            String ward,
            String district,
            String city
    ) {
        String street = stripLeadingHouseNumber(firstAddressSegment(clean(address)));
        return new SearchContext(
                meaningfulTokens(street),
                meaningfulTokens(ward),
                meaningfulTokens(district),
                meaningfulTokens(city),
                extractHouseNumber(address)
        );
    }

    private record SearchContext(
            List<String> streetTokens,
            List<String> wardTokens,
            List<String> districtTokens,
            List<String> cityTokens,
            String houseNumber
    ) {
    }

    private record ScoredMatch(
            double latitude,
            double longitude,
            String displayName,
            int score
    ) {
    }
}
