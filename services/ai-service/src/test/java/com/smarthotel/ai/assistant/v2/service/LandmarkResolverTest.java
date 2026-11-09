package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.NearbyLocation;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class LandmarkResolverTest {
    private String terminal(String name,String city,String key,String value,String osmType,int id,double lat,double lon,String extent) {
        return """
            {"geometry":{"type":"Point","coordinates":[%s,%s]},"properties":{"name":"%s","city":"%s","countrycode":"VN","osm_type":"%s","osm_id":%d,"osm_key":"%s","osm_value":"%s","extent":%s}}
            """.formatted(lon,lat,name,city,osmType,id,key,value,extent);
    }
    @Test void typedPoiRequiresTheCorrectRegionKindAndCodeAndCollapsesOnlyAnEnclosingBuilding() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var query=new java.util.concurrent.atomic.AtomicReference<String>();
        server.createContext("/api/",exchange->{
            query.set(java.net.URLDecoder.decode(exchange.getRequestURI().getRawQuery(),StandardCharsets.UTF_8));
            String body="{\"features\":["+String.join(",",List.of(
                terminal("Terminal T7","Ho Chi Minh City","aeroway","terminal","W",700,10.81,106.65,"[106.64,10.82,106.66,10.80]"),
                terminal("Nhà ga chính T7 (Tầng 2)","Thành phố Hồ Chí Minh","aeroway","terminal","N",701,10.811,106.651,"null"),
                terminal("Terminal T7","Hanoi","aeroway","terminal","W",702,21.2,105.8,"null"),
                terminal("T7 Café","Ho Chi Minh City","amenity","cafe","N",703,10.81,106.65,"null"),
                terminal("Entrance to Terminal T7","Ho Chi Minh City","highway","tertiary","W",704,10.81,106.65,"null"),
                terminal("Terminal T8","Ho Chi Minh City","aeroway","terminal","W",705,10.81,106.65,"null")))+"]}";
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8); exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(200,bytes.length);try(var stream=exchange.getResponseBody()){stream.write(bytes);}
        });server.start();
        try {
            var resolver=new LandmarkResolver(true,"http://127.0.0.1:"+server.getAddress().getPort());
            var result=resolver.resolve(NearbyLocation.requested("Nhà ga T7",5.),"Hồ Chí Minh");
            assertThat(result.status()).isEqualTo("FOUND");
            assertThat(result.choices()).hasSize(1);
            assertThat(result.choices().get(0).sourceUrl()).isEqualTo("https://www.openstreetmap.org/way/700");
            assertThat(query.get()).contains("Hồ Chí Minh","countrycode=VN");
        } finally {server.stop(0);}
    }
    @Test void aCityAliasCannotResolveToAnUnrelatedBusinessAndCachedTerminalsRemainDistinct() {
        var resolver=new LandmarkResolver();
        for(String alias:java.util.List.of("Sài Gòn","SAIGON","Ho Chi Minh City","TP.HCM","Hà Nội")) {
            var result=resolver.resolve(NearbyLocation.requested(alias,5.),"Hồ Chí Minh");
            assertThat(result.status()).isEqualTo("AMBIGUOUS");
            assertThat(result.choices()).isEmpty();
        }
        var first=resolver.resolve(NearbyLocation.requested("Nhà ga T1",5.),"Ho Chi Minh City");
        var third=resolver.resolve(NearbyLocation.requested("Nhà ga T3",5.),"Sài Gòn");
        assertThat(first.status()).isEqualTo("FOUND");
        assertThat(third.status()).isEqualTo("FOUND");
        assertThat(first.choices().get(0).sourceUrl()).isEqualTo("https://www.openstreetmap.org/way/196966091");
        assertThat(first.choices().get(0).latitude()).isEqualTo(10.8137889);
        assertThat(first.choices().get(0).longitude()).isEqualTo(106.6620986);
        assertThat(third.choices().get(0).sourceUrl()).isNotEqualTo(first.choices().get(0).sourceUrl());
    }
    @Test void outsideRegionOrWrongKindIsNeverAcceptedEvenWithTheSameName() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/",exchange->{
            String body="{\"features\":["+terminal("Terminal T7","Hanoi","aeroway","terminal","W",1,21.2,105.8,"null")+","+
                    terminal("Terminal T7","Ho Chi Minh City","amenity","cafe","N",2,10.81,106.65,"null")+"]}";
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,bytes.length);
            try(var stream=exchange.getResponseBody()){stream.write(bytes);}
        });server.start();
        try {
            var resolver=new LandmarkResolver(true,"http://127.0.0.1:"+server.getAddress().getPort());
            assertThat(resolver.resolve(NearbyLocation.requested("Nhà ga T7",5.),"Hồ Chí Minh").status()).isEqualTo("UNKNOWN");
        } finally {server.stop(0);}
    }
    private String feature(String name, String country, String coords, int id) {
        return """
            {"geometry":{"type":"Point","coordinates":%s},"properties":{"name":"%s","city":"Thành phố Hồ Chí Minh","countrycode":"%s","osm_type":"N","osm_id":%d,"osm_key":"amenity","osm_value":"%s"}}
            """.formatted(coords,name,country,id,name.startsWith("Bệnh viện")?"hospital":"theatre");
    }
    @Test void geocoderRequiresNameAndCoordinatesCachesResultsAndDoesNotInventUnknownPlaces() throws Exception {
        var calls=new AtomicInteger();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/",exchange->{
            calls.incrementAndGet();
            String body="{\"features\":["+feature("Nhà hát Tháng Sáu","VN","[106.7,10.8]",1)+","+feature("Nhà hát Tháng Sáu","US","[-120,40]",2)+","+feature("Nhà hát Tháng Sáu","VN","[null,null]",3)+"]}";
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(200,bytes.length);
            try(var stream=exchange.getResponseBody()){stream.write(bytes);}
        });
        server.start();
        try {
            var resolver=new LandmarkResolver(true,"http://127.0.0.1:"+server.getAddress().getPort());
            var found=resolver.resolve(NearbyLocation.requested("Nhà hát Tháng Sáu",3.),"Hồ Chí Minh");
            assertThat(found.status()).isEqualTo("FOUND");
            assertThat(found.choices()).hasSize(1);
            assertThat(found.choices().get(0).sourceUrl()).isEqualTo("https://www.openstreetmap.org/node/1");
            assertThat(resolver.resolve(NearbyLocation.requested("Nhà hát Tháng Sáu",1.),"Hồ Chí Minh").choices().get(0).radiusKm()).isEqualTo(1);
            assertThat(calls.get()).isEqualTo(1);
            assertThat(resolver.resolve(NearbyLocation.requested("Nhà hát Không Tồn Tại",1.),"Hồ Chí Minh").status()).isEqualTo("UNAVAILABLE"); // bounded provider rate
        } finally {server.stop(0);}
    }
    @Test void ambiguousMapRecordsNeedClarification() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/",exchange->{
            byte[] bytes=("{\"features\":["+feature("Bệnh viện Bình An","VN","[106.7,10.8]",1)+","+feature("Bệnh viện Bình An","VN","[106.8,10.9]",2)+"]}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json"); exchange.sendResponseHeaders(200,bytes.length);
            try(var stream=exchange.getResponseBody()){stream.write(bytes);}
        }); server.start();
        try {
            var resolver=new LandmarkResolver(true,"http://127.0.0.1:"+server.getAddress().getPort());
            assertThat(resolver.resolve(NearbyLocation.requested("Bệnh viện Bình An",5.),"Hồ Chí Minh").status()).isEqualTo("AMBIGUOUS");
        } finally {server.stop(0);}
    }
}
