package com.smarthotel.ai.assistant.v2.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.ai.assistant.v2.dto.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class HotelChoicePresenterTest {
    final ObjectMapper json = new ObjectMapper();
    AssistantHotelCard hotel(String name,String features,boolean fits,Integer count,Double rating) throws Exception {
        return json.readValue("""
                {"name":"%s","exactMatch":%s,"amenities":%s,"reviewCount":%s,"averageRating":%s,"pricePerNight":%s,"availabilityChecked":true}
                """.formatted(name,fits,features,count,rating,name.equals("Park")?680000:720000),AssistantHotelCard.class);
    }
    IntentAnalysis trip(String preference) {
        return new IntentAnalysis("COMPARE_HOTELS","Hồ Chí Minh",null,null,2,1,null,null,List.of(),List.of(),null,new AssistantRoomCriteria(false,false,preference));
    }
    @Test void familyAdviceUsesDeclaredBenefitsInsteadOfStarsPricesOrAnInventedServiceRanking() throws Exception {
        var hotels=List.of(hotel("Park","[\"Phòng gym\"]",true,0,null),hotel("Riverside","[\"Hồ bơi\",\"Nhà hàng\"]",true,0,null));
        String reply=HotelChoicePresenter.answer(hotels,trip("BALANCED"));
        assertThat(reply).contains("ưu tiên Riverside","Hồ bơi","Nhà hàng","chưa đủ căn cứ").doesNotContain("720.000","tốt nhất");
        assertThat(HotelChoicePresenter.answer(hotels,trip("CHEAPEST"))).contains("chọn Park","giá cơ bản","680.000");
        assertThat(HotelChoicePresenter.answer(hotels,trip("QUALITY"))).contains("Chưa đủ đánh giá").doesNotContain("ưu tiên Riverside");
    }
    @Test void aBetterAmenitySetCannotOverrideCapacityAvailabilityOrOtherHardConstraints() throws Exception {
        var unavailable=hotel("Riverside","[\"Hồ bơi\",\"Nhà hàng\"]",false,20,9.5);
        var available=hotel("Park","[]",true,1,8.0);
        assertThat(HotelChoicePresenter.answer(List.of(available,unavailable),trip("FAMILY"))).doesNotContain("ưu tiên Riverside");
        assertThat(HotelChoicePresenter.answer(List.of(unavailable),trip("FAMILY"))).contains("Chưa có khách sạn nào");
    }
    @Test void equalOrMissingEvidenceProducesATargetedQuestionInsteadOfAnArbitraryWinner() throws Exception {
        var hotels=List.of(hotel("Park","[]",true,2,8.0),hotel("Riverside","[]",true,3,8.0));
        assertThat(HotelChoicePresenter.answer(hotels,trip("BALANCED"))).contains("Bạn ưu tiên").doesNotContain("ưu tiên Park");
        assertThat(HotelChoicePresenter.answer(hotels,trip("QUALITY"))).contains("bằng nhau");
        assertThat(HotelChoicePresenter.answer(hotels,trip("LARGEST"))).contains("Chưa có diện tích");
    }
}
