"""Check a candidate parser against the private model without mutating the API process."""
import importlib.util
import json
import sys
from pathlib import Path
sys.path.insert(0,"/app")

spec=importlib.util.spec_from_file_location("candidate_dialogue","/tmp/clarification_candidate.py")
dialogue=importlib.util.module_from_spec(spec)
spec.loader.exec_module(dialogue)
cases=[
    ("Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất","RECOMMEND_HOTELS",True),
    ("Nhà ga T3 của sân bay Tân Sơn Nhất","RECOMMEND_HOTELS",True),
    ("Bệnh viện Chợ Rẫy","RECOMMEND_HOTELS",True),
    ("Trường Đại học Văn Lang","RECOMMEND_HOTELS",True),
    ("Hồ Chí Minh","RECOMMEND_HOTELS",False),
    ("Tôi quên mật khẩu thì làm sao","GENERAL",False),
    ("Tôi có những đơn đặt phòng nào","MY_BOOKINGS",False),
    ("Tìm khách sạn ở Đà Nẵng","RECOMMEND_HOTELS",False),
    ("Viết bài văn về bóng đá","OUT_OF_SCOPE",False),
    ("Không biết","CLARIFY",False),
]
results=[]
for question,intent,place in cases:
    decision=dialogue.classify(question,conversation={"lastIntent":"RECOMMEND_HOTELS","displayedHotels":0,"pendingSlot":"landmark","recentUserQuestions":["có khách sạn nào gần nhà ga t3 không"]})
    passed=decision["intent"]==intent and bool(decision["slots"].get("landmark"))==place
    if place:
        from grounding import norm
        passed=passed and decision["slots"]["landmark"]==norm(question)
    results.append({"question":question,"passed":passed,"decision":decision})
    print(json.dumps(results[-1],ensure_ascii=True),flush=True)
Path("/tmp/clarification-candidate.json").write_text(json.dumps({"passed":sum(r["passed"] for r in results),"total":len(results),"results":results},ensure_ascii=False,indent=2))
raise SystemExit(0 if all(r["passed"] for r in results) else 1)
