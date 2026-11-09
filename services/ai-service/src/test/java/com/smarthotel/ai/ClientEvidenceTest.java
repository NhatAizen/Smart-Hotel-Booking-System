package com.smarthotel.ai;

import com.sun.net.httpserver.HttpServer;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.booking.BookingClient;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.web.client.RestClientException;
import static org.assertj.core.api.Assertions.*;

class ClientEvidenceTest {
    private HttpServer server;
    private HotelClient hotels;
    private BookingClient bookings;
    private String payload="null";
    @BeforeEach void start() throws Exception {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{
            byte[] bytes=payload.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(200,bytes.length);
            try(var stream=exchange.getResponseBody()) {stream.write(bytes);}
        });
        server.start();
        String url="http://127.0.0.1:"+server.getAddress().getPort();
        hotels=new HotelClient(url); bookings=new BookingClient(url);
    }
    @AfterEach void stop() {if(server!=null) server.stop(0);}
    @Test void missingSuccessfulResponsesAreUnavailableNotProofOfZeroResults() {
        UUID id=UUID.randomUUID();
        assertThatThrownBy(()->hotels.getHotels()).isInstanceOf(RestClientException.class);
        assertThatThrownBy(()->hotels.getRooms(id)).isInstanceOf(RestClientException.class);
        assertThatThrownBy(()->hotels.getRoomTypes(id)).isInstanceOf(RestClientException.class);
        assertThatThrownBy(()->bookings.getCustomerBookings(id,"test-token")).isInstanceOf(RestClientException.class);
        assertThatThrownBy(()->bookings.getReviews(id)).isInstanceOf(RestClientException.class);
    }
    @Test void explicitEmptyListsAreLegitimateEvidenceOfNoResults() {
        payload="[]";
        UUID id=UUID.randomUUID();
        assertThat(hotels.getHotels()).isEmpty();
        assertThat(hotels.getRooms(id)).isEmpty();
        assertThat(hotels.getRoomTypes(id)).isEmpty();
        assertThat(bookings.getCustomerBookings(id,"test-token")).isEmpty();
        assertThat(bookings.getReviews(id)).isEmpty();
    }
    @Test void nullRowsAreASourceFailureRatherThanAnApplicationCrashOrAnEmptyCatalog() {
        payload="[null]";
        UUID id=UUID.randomUUID();
        assertThatThrownBy(()->hotels.getHotels()).isInstanceOf(RestClientException.class);
        assertThatThrownBy(()->hotels.getRooms(id)).isInstanceOf(RestClientException.class);
        assertThatThrownBy(()->bookings.getReviews(id)).isInstanceOf(RestClientException.class);
        assertThatThrownBy(()->bookings.getCustomerBookings(id,"test-token")).isInstanceOf(RestClientException.class);
    }
}
