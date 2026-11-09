import os
import unittest
from app import SemanticRouter


class SemanticMeaningTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.router = SemanticRouter(os.environ.get("MODEL_DIR", "/models/e5"), "intents.json")

    def test_paraphrases_not_present_verbatim_in_reference_examples(self):
        cases = [
            ("Ở khách sạn đó có loại nào hợp với cả nhà nhất nhỉ?", "ROOM_RECOMMEND"),
            ("tôi hỏi bạn phòng nào được nhất trong các phòng ở khách sạn đó", "ROOM_RECOMMEND"),
            ("Có cái nào đỡ tốn hơn không?", "ROOM_RECOMMEND"),
            ("Khách trước có chê gì không?", "REVIEW_SUMMARY"),
            ("Tôi quên mất mật khẩu rồi", "GENERAL"),
            ("Tìm giúp tôi một khách sạn ở Nha Trang", "RECOMMEND_HOTELS"),
            ("Hôm nay trời có mưa không?", "OUT_OF_SCOPE"),
        ]
        references = {text for entry in self.router.entries for text in entry["texts"]}
        for message, intent in cases:
            with self.subTest(message=message):
                self.assertNotIn(message, references)
                self.assertEqual(self.router.classify(message, True)["intent"], intent)

    def test_room_preferences_are_semantic(self):
        self.assertEqual(self.router.classify("Có cái nào đỡ tốn hơn không?", True)["preference"], "CHEAPEST")
        self.assertEqual(self.router.classify("Căn nào thoáng và rộng rãi hơn?", True)["preference"], "LARGEST")

    def test_conversation_actions_are_distinct_from_subject_intents(self):
        cases = [
            ("Còn khách sạn nào khác không", "MORE_HOTELS"),
            ("Cho tôi thêm vài nơi nghỉ khác nữa nhé", "MORE_HOTELS"),
            ("Tôi cần phòng ở Sài Gòn", "NEW_SEARCH"),
            ("Cần chỗ nghỉ ở Sài Gòn cho cả nhà", "NEW_SEARCH"),
            ("Kiểm tra lại giá, phòng trống và ưu đãi với ngày tôi vừa chọn", "RECHECK_TRIP"),
            ("Tra lại giúp tôi với lịch mới nhé", "RECHECK_TRIP"),
            ("Khách sạn còn phòng không?", "NONE"),
        ]
        for question, expected in cases:
            with self.subTest(question=question):
                self.assertEqual(self.router.classify(question, True)["action"], expected)


if __name__ == "__main__":
    unittest.main()
