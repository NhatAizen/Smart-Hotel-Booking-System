"""Invariants for language-model entity outputs, independent of model weights."""
import unittest
from grounding import validate, money, norm, followup_operation, proximity_slots, city_reply

class EvidenceTest(unittest.TestCase):
    def test_attribute_and_entity_relations_retain_their_read_capability(self):
        for question,task in (("Cho tôi địa chỉ khách sạn thứ ba","HOTEL_DETAILS"),("Số điện thoại khách sạn số 2","HOTEL_DETAILS"),("Khách sạn số 3 có những loại phòng nào?","ROOM_RECOMMEND")):
            result=validate(question,{"intent":"CLARIFY","action":"SELECT_OPTION","slots":{},"preference":"BALANCED"})
            self.assertEqual(result["intent"],task)
            self.assertEqual(result["action"],"SELECT_OPTION")
    def test_an_ordinal_resolves_the_entity_without_erasing_the_requested_task(self):
        for task in ("HOTEL_DETAILS","ROOM_RECOMMEND"):
            result=validate("Cho tôi xem khách sạn số 3",{"intent":task,"action":"NONE","slots":{},"preference":"BALANCED"})
            self.assertEqual(result["intent"],task)
            self.assertEqual(result["action"],"SELECT_OPTION")
    def test_information_requests_supersede_a_previous_group_task(self):
        for question in ("Cho tôi tọa độ khách sạn số 3 với nhà ga T1", "Cho tôi số điện thoại khách sạn 2", "Cho biết giờ nhận phòng khách sạn này"):
            for previous in ("So sánh hai khách sạn", "Nên ưu tiên khách sạn nào"):
                self.assertEqual(followup_operation(question,[previous],"COMPARE"),"PARSE")
    def test_coordinate_facts_are_not_a_hotel_comparison(self):
        for message in ("Cho tôi tọa độ khách sạn số 3 với nhà ga T1 đi","Vĩ độ và kinh độ của khách sạn đó","GPS coordinates for the third hotel"):
            result=validate(message,{"intent":"COMPARE_HOTELS","action":"NONE","preference":"BALANCED","slots":{}})
            self.assertEqual((result["intent"],result["action"]),("DIRECTIONS","NONE"))
    def test_route_choices_are_not_geocoded_and_departure_can_reference_a_known_hotel(self):
        state={"lastIntent":"DIRECTIONS","pendingSlot":"routeOrigin"}
        result=validate("3",{"intent":"CLARIFY","action":"NONE","preference":"BALANCED","slots":{"origin":"3"}},state)
        self.assertEqual(result["intent"],"DIRECTIONS")
        self.assertNotIn("origin",result["slots"])
        result=validate("Xuất phát từ Nhà ga T2 đến đó",{"intent":"CLARIFY","action":"NONE","preference":"BALANCED","slots":{}},state)
        self.assertEqual(result["intent"],"DIRECTIONS")
        self.assertEqual(result["slots"]["origin"],"nha ga t2")

    def test_pagination_cannot_change_the_explicit_entity_type(self):
        for message in ("Có loại phòng khác để cân nhắc?","Xem tiếp các phòng chưa được gợi ý","Show more room types"):
            for action in ("MORE_HOTELS","MORE_OPTIONS","MORE_ROOMS"):
                with self.subTest(message=message,action=action):
                    result=validate(message,{"intent":"RECOMMEND_HOTELS","action":action,"slots":{},"preference":"BALANCED"})
                    self.assertEqual((result["intent"],result["action"]),("ROOM_RECOMMEND","MORE_ROOMS"))
        private=validate("Xem thêm đơn phòng đã đặt",{"intent":"MY_BOOKINGS","action":"MORE_OPTIONS","slots":{},"preference":"BALANCED"})
        self.assertEqual(private["intent"],"MY_BOOKINGS")

    def test_city_replies_cannot_become_pois_even_if_the_model_calls_them_places(self):
        pending={"pendingSlot":"landmark","lastIntent":"RECOMMEND_HOTELS"}
        for alias in ("Sài Gòn","SÀI GÒN","SAIGON","TP.HCM","HCM","Ho Chi Minh City","ở Sài Gòn","tại Thành phố Hồ Chí Minh"):
            with self.subTest(alias=alias):
                self.assertEqual(city_reply(alias),"Hồ Chí Minh")
                decision=self.decision({"landmark":alias}); decision.update(intent="RECOMMEND_HOTELS",action="NEW_SEARCH")
                output=validate(alias,decision,pending)
                self.assertEqual(output["slots"].get("city"),"Hồ Chí Minh")
                self.assertNotIn("landmark",output["slots"])
                self.assertEqual(output["action"],"REFINE_SEARCH")
        for poi in ("Nhà ga T1","Nhà ga T3","Bệnh viện Chợ Rẫy","Trường Đại học Văn Lang"):
            self.assertIsNone(city_reply(poi))

    def test_implicit_landmark_is_preserved_without_requiring_a_near_keyword(self):
        for place in ("nhà ga T3","bệnh viện Chợ Rẫy","trường đại học Văn Lang","bến xe Miền Đông","nhà hát Thành phố","bảo tàng Mỹ thuật","chợ Bến Thành"):
            for prefix in ("Tôi muốn tìm khách sạn ","Cần chỗ nghỉ ","Tìm khách sạn ở "):
                result=self.decision(); result.update(intent="CLARIFY",action="NONE")
                output=validate(prefix+place,result)
                self.assertEqual(output["intent"],"RECOMMEND_HOTELS")
                self.assertEqual(output["slots"]["landmark"],norm(place))
                self.assertEqual(output["action"],"NEW_SEARCH")
        for text in ("Tôi tìm khách sạn cho gia đình","Tìm khách sạn cho 2 người lớn","Cần khách sạn Quận 1","Hướng dẫn cách đặt khách sạn sân bay Tân Sơn Nhất","Tôi muốn biết cách đặt khách sạn nhà ga T3","Tôi muốn xem đánh giá khách sạn sân bay Tân Sơn Nhất","Tôi muốn xem đơn đã đặt khách sạn nhà ga T3"):
            self.assertNotIn("landmark",proximity_slots(text))

    def test_a_landmark_cannot_also_be_misclassified_as_the_city(self):
        result=self.decision({"city":"nhà ga T3"}); result.update(intent="RECOMMEND_HOTELS")
        output=validate("Tôi muốn tìm khách sạn nhà ga T3",result)
        self.assertNotIn("city",output["slots"])
        self.assertEqual(output["slots"]["landmark"],"nha ga t3")
        result=self.decision({"city":"nhà ga T3"}); result.update(intent="RECOMMEND_HOTELS")
        output=validate("Tìm khách sạn nhà ga T3 ở Sài Gòn",result)
        self.assertEqual(output["slots"]["landmark"],"nha ga t3")
        self.assertEqual(output["slots"]["city"],"Hồ Chí Minh")

    def test_comparison_subject_and_destination_switch_cannot_be_lost(self):
        for question in ("Hai phòng ấy chênh lệch thế nào", "So sánh ba loại phòng", "Những phòng này khác nhau ở đâu"):
            decision=self.decision(); decision.update(intent="COMPARE_HOTELS",action="NONE")
            self.assertEqual(validate(question,decision)["intent"],"ROOM_COMPARE")
        for operator in ("đổi", "chuyển"):
            for city in ("Cần Thơ", "Hà Nội", "Huế"):
                decision=self.decision(); decision.update(intent="RECOMMEND_HOTELS",action="NONE")
                result=validate(f"Giờ {operator} sang tìm ở {city}",decision)
                self.assertEqual(result["action"],"NEW_SEARCH")
        decision=self.decision(); decision.update(intent="DIRECTIONS",action="NONE")
        self.assertEqual(validate("Giờ tôi chuyển sang tìm ở Cần Thơ",decision)["action"],"NEW_SEARCH")
        decision=self.decision(); decision.update(intent="DIRECTIONS",action="NONE")
        self.assertEqual(validate("Tôi cần khách sạn gần nhà ga T3",decision)["intent"],"RECOMMEND_HOTELS")

    def test_directions_are_a_route_read_not_a_nearby_search(self):
        for question in ("Cho tôi xem địa chỉ từ nhà ga T3 đến khách sạn đó đi", "Chỉ đường từ nhà ga T3 đến khách sạn thứ hai", "Show directions from Terminal T3 to that hotel", "Mở đường đi đến khách sạn đó"):
            result=self.decision({"landmark":"nhà ga T3"}); result.update(intent="RECOMMEND_HOTELS",action="NEW_SEARCH")
            output=validate(question,result)
            self.assertEqual((output["intent"],output["action"]),("DIRECTIONS","NONE"))
            self.assertNotIn("landmark",output["slots"])
        result=validate("Chỉ đường từ nhà ga T3 đến khách sạn thứ hai",self.decision())
        self.assertEqual(result["slots"]["origin"],"nha ga t3")
        result=self.decision({"origin":"Nhà ga T3"}); result.update(intent="DIRECTIONS")
        self.assertNotIn("origin",validate("Chỉ đường đến khách sạn đó",result)["slots"])

    def test_question_particles_are_not_part_of_the_landmark(self):
        for place in ("nhà ga T3", "Bệnh viện Chợ Rẫy", "Nhà hát Tháng Sáu", "Trường Đại học Văn Lang"):
            for tail in ("không", "không?", "không nhỉ", "không ạ", "chưa"):
                text=f"Có khách sạn nào gần {place} {tail}"
                # Exercise both a missing entity prediction and one including the
                # question particle, independently of the actual model weights.
                for predicted in (None,f"{place} {tail.rstrip('?')}"):
                    result=self.decision({"landmark":predicted} if predicted else {})
                    self.assertEqual(validate(text,result)["slots"]["landmark"],norm(place))

    def test_bare_name_fills_only_a_pending_landmark_and_must_be_current_evidence(self):
        pending={"lastIntent":"RECOMMEND_HOTELS","pendingSlot":"landmark"}
        for name in ("Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất", "Bệnh viện Chợ Rẫy", "Bảo tàng Hư Không"):
            decision=self.decision({"landmark":name}); decision.update(intent="CLARIFY")
            result=validate(name,decision,pending)
            self.assertEqual(result["slots"]["landmark"],norm(name))
            self.assertEqual((result["intent"],result["action"]),("RECOMMEND_HOTELS","NEW_SEARCH"))
            self.assertNotIn("landmark",validate(name,self.decision({"landmark":name}))["slots"])
        self.assertNotIn("landmark",validate("Tôi quên mật khẩu",self.decision({"landmark":"Nhà ga T3"}),pending)["slots"])
        guide=self.decision({"landmark":"mật khẩu"}); guide.update(intent="GENERAL",topic="PASSWORD")
        self.assertNotIn("landmark",validate("Tôi quên mật khẩu",guide,pending)["slots"])
        city=self.decision({"city":"Hồ Chí Minh"})
        self.assertEqual(validate("Hồ Chí Minh",city,pending)["slots"],{"city":"Hồ Chí Minh"})

    def test_changing_an_existing_reservation_is_a_procedure_not_room_discovery(self):
        for verb in ("đổi", "thay", "chuyển"):
            for help_phrase in ("làm sao", "thế nào"):
                result=validate(f"Muốn {verb} loại phòng đã đặt thì {help_phrase}",self.decision())
                self.assertEqual((result["intent"],result["topic"],result["action"]),("GENERAL","ROOM_CHANGE","NONE"))

    def test_proximity_is_a_relation_not_a_dictionary_of_landmarks(self):
        for relation in ("gần", "quanh", "cạnh", "near", "close to"):
            for place in ("nhà ga T3", "Bệnh viện Chợ Rẫy", "Nhà hát Tháng Sáu", "Trường Đại học Văn Lang"):
                with self.subTest(relation=relation,place=place):
                    result=validate(f"Tìm khách sạn {relation} {place}",self.decision())
                    self.assertEqual(result["intent"],"RECOMMEND_HOTELS")
                    self.assertEqual(result["action"],"NEW_SEARCH")
                    self.assertEqual(result["slots"]["landmark"],norm(place))
        for text in ("Nhà hàng gần khách sạn này", "Đường đi từ khách sạn đến T3", "Phòng này có bếp không"):
            self.assertEqual(proximity_slots(text),{})

    def test_radius_units_and_unknown_route_distance_remain_distinct(self):
        for text,place,radius in [("Khách sạn cách Chợ Bến Thành 2km","cho ben thanh",2),
                ("Tìm khách sạn gần Nhà hát Tháng Sáu trong 500m","nha hat thang sau",.5),
                ("Hotels within 2 km of City Hall","city hall",2)]:
            result=proximity_slots(text)
            self.assertEqual(result["landmark"],place)
            self.assertEqual(result["radiusKm"],radius)
        self.assertTrue(proximity_slots("Tìm khách sạn gần T3 đi bộ 5 phút")["unsupportedConstraints"])
        self.assertEqual(proximity_slots("Bỏ điều kiện gần nhà ga"),{"clearNearby":True})
        for text in ("Khách sạn gần T3 trong 200km", "Bán kính -2 km", "Gần T3 trong 10m"):
            self.assertTrue(proximity_slots(text)["unsupportedConstraints"])
        self.assertTrue(proximity_slots("Tìm khách sạn cách sân bay đúng 500 mét")["unsupportedConstraints"])

    def test_catalog_pagination_cannot_become_a_personal_booking_read(self):
        result=self.decision(); result.update(intent="MY_BOOKINGS")
        output=validate("Danh sách chỗ nghỉ đã hết chưa, nếu chưa cho xem tiếp",result)
        self.assertEqual((output["intent"],output["action"]),("RECOMMEND_HOTELS","MORE_HOTELS"))
        result=self.decision(); result.update(intent="MY_BOOKINGS")
        self.assertEqual(validate("Xem thêm các khách sạn trong đơn tôi đã đặt",result)["intent"],"MY_BOOKINGS")

    def test_a_comparison_reference_keeps_the_pending_goal_but_new_tasks_supersede_it(self):
        self.assertEqual(followup_operation("2 khách sạn bạn so sánh đấy",["nên ưu tiên khách sạn nào"],"COMPARE"),"ADVISE")
        self.assertEqual(followup_operation("Nếu xét chi phí thì nên chọn bên nào?",[],"COMPARE"),"ADVISE")
        self.assertEqual(followup_operation("So sánh cả 3 khách sạn",["nên chọn bên nào"],"ADVISE"),"COMPARE")
        self.assertEqual(followup_operation("Hai khách sạn đó",["so sánh giúp tôi"],"COMPARE"),"COMPARE")
        self.assertEqual(followup_operation("Chọn khách sạn Đà Nẵng",["nên chọn bên nào"],"PARSE"),"PARSE")
        self.assertEqual(followup_operation("Còn nơi khác không",["nên chọn bên nào"],"MORE"),"MORE")
        self.assertEqual(followup_operation("So sánh theo ngày tôi vừa chọn",[],"COMPARE"),"COMPARE")
        self.assertEqual(followup_operation("Đừng chọn thay tôi, hãy so sánh",[],"COMPARE"),"COMPARE")
        self.assertEqual(followup_operation("Bạn giúp so sánh các khách sạn tôi đã chọn",[],"COMPARE"),"COMPARE")

    def test_contextual_advice_is_not_replaced_by_a_repeated_comparison(self):
        for question in ("nên ưu tiên khách sạn nào", "2 khách sạn bạn so sánh đấy", "Hai chỗ vừa rồi ấy"):
            result=self.decision(); result.update(intent="COMPARE_HOTELS", action="CHOOSE_OPTION")
            self.assertEqual(validate(question,result)["action"],"CHOOSE_OPTION")

    def test_comparison_cannot_turn_into_discovery_or_pagination(self):
        for intent in ("COMPARE_HOTELS", "ROOM_COMPARE"):
            for action in ("NONE", "MORE_HOTELS", "MORE_ROOMS", "MORE_OPTIONS", "SELECT_OPTION", "REFINE_SEARCH", "RECHECK_TRIP", "NEW_SEARCH"):
                with self.subTest(intent=intent,action=action):
                    result=self.decision(); result.update(intent=intent,action=action)
                    output=validate("So sánh khách sạn 1,3" if intent=="COMPARE_HOTELS" else "So sánh phòng 1,3",result)
                    self.assertEqual(output["intent"],intent)
                    self.assertEqual(output["action"],"NONE")

    def test_actual_alternative_request_keeps_its_pagination_action(self):
        result=self.decision(); result.update(intent="ROOM_COMPARE",action="MORE_ROOMS")
        self.assertEqual(validate("Có loại phòng khác để tôi cân nhắc không",result)["action"],"MORE_ROOMS")

    def decision(self, slots=None):
        return {"intent":"ROOM_RECOMMEND","topic":None,"action":"NONE","preference":"BALANCED","slots":slots or {}}

    def test_invented_constraints_cannot_change_the_trip(self):
        result=validate("Bạn gợi ý loại phòng phù hợp tại đây nhé",self.decision({"adults":1,"children":0,"city":"Hà Nội","budget":999999,"amenitiesAdd":["WiFi","Hồ bơi"],"refundableOnly":False,"breakfastOnly":False}))
        for key in ("adults","children","city","budget","amenitiesAdd","refundableOnly","breakfastOnly"):
            self.assertNotIn(key,result["slots"])

    def test_additions_and_removals_have_independent_scope(self):
        result=validate("Bỏ yêu cầu có hồ bơi và thêm wifi, không cần ăn sáng nhưng phải được hoàn tiền",self.decision())
        self.assertEqual(result["slots"]["amenitiesAdd"],["WiFi"])
        self.assertCountEqual(result["slots"]["amenitiesRemove"],["Hồ bơi","Bữa sáng"])
        self.assertTrue(result["slots"]["refundableOnly"])
        self.assertFalse(result["slots"]["breakfastOnly"])
        self.assertEqual(result["action"],"REFINE_SEARCH")

    def test_amounts_written_differently_have_the_same_value(self):
        for expression, expected in [("ba triệu",3000000),("tám trăm nghìn",800000),("một triệu rưỡi",1500000),("hai triệu năm trăm nghìn",2500000),("1,5tr",1500000),("900k",900000),("1.500.000 đồng",1500000)]:
            with self.subTest(expression=expression):
                self.assertEqual(money(norm(expression)),expected)

    def test_missing_capability_is_never_silently_ignored(self):
        result=validate("Cần phòng nhìn ra biển và giường tròn",self.decision({"amenitiesAdd":["Spa"]}))
        self.assertNotIn("amenitiesAdd",result["slots"])
        self.assertEqual(len(result["slots"]["unsupportedConstraints"]),2)

    def test_negated_destination_does_not_override_new_destination(self):
        result=validate("Không đi Huế, tìm nơi ở Quy Nhơn",self.decision({"city":"Huế"}))
        self.assertEqual(result["slots"]["city"],"Quy Nhơn")

    def test_temporal_updates_are_not_confused_with_personal_bookings(self):
        for subject in ("Ngày ở","Lịch trình","Thời gian lưu trú"):
            for change in ("đổi","sửa","thay"):
                for operation in ("kiểm tra","tra lại","tìm lại"):
                    question=f"{subject} vừa {change}, {operation} giúp tôi"
                    with self.subTest(question=question):
                        initial=self.decision(); initial["intent"]="MY_BOOKINGS"
                        self.assertEqual(validate(question,initial)["action"],"RECHECK_TRIP")

    def test_procedures_policies_and_room_requirements_have_different_sources(self):
        for question,intent,topic in [
            ("Hướng dẫn thủ tục trả phòng","GENERAL","CHECK_OUT"),
            ("Các bước nhận phòng","GENERAL","CHECK_IN"),
            ("Mang theo thú cưng được chứ","GENERAL","POLICY"),
            ("Có loại phòng cho phép hoàn khi hủy chứ","ROOM_RECOMMEND",None)]:
            with self.subTest(question=question):
                initial=self.decision(); initial["intent"]="REVIEW_SUMMARY"
                result=validate(question,initial)
                self.assertEqual(result["intent"],intent)
                self.assertEqual(result["topic"],topic)

if __name__=="__main__":
    unittest.main()
