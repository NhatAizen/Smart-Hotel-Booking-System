package com.smarthotel.ai.assistant.v2.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.smarthotel.ai.assistant.v2.dto.*;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;

class SemanticConversationTest {
    @Test void onlyBoundedUserQuestionsAndStructuredStateReachTheInternalPlanner() throws Exception {
        var received=new AtomicReference<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/classify", exchange->{
            received.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
            byte[] result="""
                    {"intent":"COMPARE_HOTELS","action":"CHOOSE_OPTION","preference":"FAMILY","confidence":1,"model":"Qwen3-4B-Instruct-2507-Q4_K_M","slots":{}}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(200,result.length);
            try(var stream=exchange.getResponseBody()){stream.write(result);}
        });
        server.start();
        try {
            var ids=List.of(UUID.randomUUID(),UUID.randomUUID());
            var context=new AssistantConversationContext(List.of(),ids,null,"COMPARE_HOTELS",List.of(),null,null,ids,ids);
            var history=new ArrayList<AssistantMessage>();
            history.add(null);
            history.add(new AssistantMessage("assistant","private records that must not enter planning"));
            for(int i=0;i<4;i++)history.add(new AssistantMessage("user",i+"x".repeat(600)));
            var request=new AssistantRequest("2 khách sạn bạn so sánh đấy",null,null,2,1,null,history,context);
            var client=new LocalSemanticClient(true,"http://127.0.0.1:"+server.getAddress().getPort());
            assertThat(client.classify(request).orElseThrow().action()).isEqualTo("CHOOSE_OPTION");
            var payload=new ObjectMapper().readTree(received.get());
            assertThat(payload.path("conversation").path("recentUserQuestions").size()).isEqualTo(3);
            assertThat(payload.path("conversation").path("recentUserQuestions").get(0).asText()).hasSize(500).startsWith("1");
            assertThat(payload.path("conversation").path("displayedHotels").asInt()).isEqualTo(2);
            assertThat(received.get()).doesNotContain("private records");
            assertThat(payload.path("conversation").has("pendingSlot")).isFalse();
            var unresolved=new AssistantQueryContext("Hồ Chí Minh",null,null,null,null,2,1,List.of(),false,null,NearbyLocation.requested("nha ga t3 khong",2.));
            var pending=new AssistantConversationContext(List.of(),List.of(),unresolved,"RECOMMEND_HOTELS",List.of(),null,null,List.of(),List.of());
            client.classify(new AssistantRequest("Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất",null,null,2,1,null,List.of(),pending));
            var pendingPayload=new ObjectMapper().readTree(received.get());
            assertThat(pendingPayload.path("conversation").path("pendingSlot").asText()).isEqualTo("landmark");
            assertThat(received.get()).doesNotContain("nha ga t3 khong");
        } finally {server.stop(0);}
    }
}
