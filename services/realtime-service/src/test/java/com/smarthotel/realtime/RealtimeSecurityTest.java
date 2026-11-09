package com.smarthotel.realtime;

import com.smarthotel.realtime.security.JwtHandshakeInterceptor;
import com.smarthotel.realtime.websocket.RealtimeSessionRegistry;
import com.smarthotel.realtime.messaging.RealtimeEventConsumer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.*;
import java.net.URI;
import java.time.Instant;
import java.util.*;
import java.io.IOException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RealtimeSecurityTest {
    private final byte[] key = "synthetic-test-secret-32-bytes-only".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    private boolean handshake(String token, Map<String,Object> attributes) {
        var request=mock(ServerHttpRequest.class);
        when(request.getURI()).thenReturn(URI.create("https://example.invalid/ws/realtime"+(token==null?"":"?token="+token)));
        return new JwtHandshakeInterceptor(Base64.getEncoder().encodeToString(key),"test-issuer")
            .beforeHandshake(request,mock(ServerHttpResponse.class),mock(WebSocketHandler.class),attributes);
    }
    private String token(String issuer, long seconds, String role) throws Exception {
        var claims=new JWTClaimsSet.Builder().subject("customer-1").issuer(issuer)
            .expirationTime(Date.from(Instant.now().plusSeconds(seconds))).claim("role",role).build();
        var jwt=new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),claims);
        jwt.sign(new MACSigner(key));return jwt.serialize();
    }
    @Test void guestsHaveNoUserIdentity() {
        var attributes=new HashMap<String,Object>();assertTrue(handshake(null,attributes));
        assertEquals("GUEST",attributes.get("role"));assertFalse(attributes.containsKey("userId"));
    }
    @Test void validIdentityAndRoleComeFromSignedToken() throws Exception {
        var attributes=new HashMap<String,Object>();assertTrue(handshake(token("test-issuer",300,"ROLE_HOTEL_ADMIN"),attributes));
        assertEquals("customer-1",attributes.get("userId"));assertEquals("HOTEL_ADMIN",attributes.get("role"));
    }
    @Test void invalidTokenIsRejected() {assertFalse(handshake("invalid",new HashMap<>()));}
    @Test void expiredTokenIsRejected() throws Exception {assertFalse(handshake(token("test-issuer",-300,"CUSTOMER"),new HashMap<>()));}
    @Test void foreignIssuerIsRejected() throws Exception {assertFalse(handshake(token("foreign",300,"SYSTEM_ADMIN"),new HashMap<>()));}

    private WebSocketSession session(String id,String user,String role) {
        var session=mock(WebSocketSession.class);when(session.getId()).thenReturn(id);
        var attrs=new HashMap<String,Object>();if(user!=null)attrs.put("userId",user);attrs.put("role",role);
        when(session.getAttributes()).thenReturn(attrs);lenient().when(session.isOpen()).thenReturn(true);return session;
    }
    @Test void privateEventsReachOnlyTheirOwner() throws Exception {
        var registry=new RealtimeSessionRegistry();var owner=session("1","u1","CUSTOMER");var other=session("2","u2","CUSTOMER");var guest=session("3",null,"GUEST");
        registry.add(owner);registry.add(other);registry.add(guest);
        registry.sendMatching("private",false,List.of("u1"),List.of());
        verify(owner).sendMessage(any(TextMessage.class));verify(other,never()).sendMessage(any());verify(guest,never()).sendMessage(any());
    }
    @Test void adminEventsNeverLeakToHotelAdminOrCustomer() throws Exception {
        var registry=new RealtimeSessionRegistry();var admin=session("1","a","SYSTEM_ADMIN");var hotel=session("2","h","HOTEL_ADMIN");var customer=session("3","c","CUSTOMER");
        registry.add(admin);registry.add(hotel);registry.add(customer);
        registry.sendMatching("review",false,List.of(),List.of("ROLE_SYSTEM_ADMIN"));
        verify(admin).sendMessage(any());verify(hotel,never()).sendMessage(any());verify(customer,never()).sendMessage(any());
    }
    @Test void publicAvailabilityReachesGuests() throws Exception {
        var registry=new RealtimeSessionRegistry();var guest=session("1",null,"GUEST");registry.add(guest);
        registry.sendMatching("availability",true,null,null);verify(guest).sendMessage(any());
    }
    @Test void brokenSocketIsRemovedWithoutBlockingOtherUsers() throws Exception {
        var registry=new RealtimeSessionRegistry();var broken=session("1","a","CUSTOMER");var healthy=session("2","b","CUSTOMER");
        doThrow(new IOException("synthetic")).when(broken).sendMessage(any());registry.add(broken);registry.add(healthy);
        registry.sendMatching("public",true,null,null);assertEquals(1,registry.size());verify(healthy).sendMessage(any());
    }
    @Test void eventsWithoutAnAudienceAreDropped() {
        var registry=mock(RealtimeSessionRegistry.class);var consumer=new RealtimeEventConsumer(registry,new ObjectMapper());
        consumer.consume(Map.of("type","PRIVATE"),null);verifyNoInteractions(registry);
    }
}
