"""Fresh private-model checks: route intent, destination selection and origin clarification."""
import sys
import os
import json
from pathlib import Path
import time
sys.path.insert(0,os.environ.get("SEMANTIC_SOURCE_DIR","/app"))
import dialogue

nearby={"lastIntent":"RECOMMEND_HOTELS","displayedHotels":3,"recentUserQuestions":["Có khách sạn nào gần nhà ga T3 ở Sài Gòn không"]}
choose={"lastIntent":"DIRECTIONS","displayedHotels":3,"pendingSlot":"routeHotel"}
origin={"lastIntent":"DIRECTIONS","displayedHotels":1,"pendingSlot":"routeOrigin"}
cases=[
    ("cho tôi địa chỉ từ khách sạn Gia Định Park Hotel đến nhà ga T2 xem thử",nearby,"DIRECTIONS","khach san gia dinh park hotel"),
    ("Xuất phát từ nhà ga T2 đến đó",choose,"DIRECTIONS","nha ga t2"),
    ("Đi từ T2 đến đó",choose,"DIRECTIONS","t2"),
    ("3",origin,"DIRECTIONS",None),
    ("3",choose,"DIRECTIONS",None),
    ("Gia Định Park Hotel 18 Phan Văn Trị, Quận Gò Vấp",choose,"DIRECTIONS",None),
    ("Cho tôi xem địa chỉ từ nhà ga T3 đến khách sạn đó đi",nearby,"DIRECTIONS","nha ga t3"),
    ("Chỉ đường từ T3 đến Greenway Phu Nhuan Hotel",nearby,"DIRECTIONS","t3"),
    ("Mở bản đồ chỉ đường đến khách sạn đó",nearby,"DIRECTIONS",None),
    ("Từ T3 đến khách sạn thứ hai đi như thế nào",nearby,"DIRECTIONS","t3"),
    ("Show directions from Terminal T3 to that hotel",nearby,"DIRECTIONS","terminal t3"),
    ("Khách sạn thứ hai",choose,"DIRECTIONS",None),
    ("Greenway",choose,"DIRECTIONS",None),
    ("Cái đầu tiên",choose,"DIRECTIONS",None),
    ("Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất",origin,"DIRECTIONS","nha ga t3 - cang hang khong quoc te tan son nhat"),
    ("Tôi xuất phát từ Bệnh viện Chợ Rẫy",origin,"DIRECTIONS","benh vien cho ray"),
    ("Tìm khách sạn ở Vũng Tàu",choose,"RECOMMEND_HOTELS",None),
    ("Tôi quên mật khẩu thì làm sao",origin,"GENERAL",None),
    ("So sánh hai khách sạn đầu tiên",choose,"COMPARE_HOTELS",None),
    ("Nên ưu tiên khách sạn nào",choose,"COMPARE_HOTELS",None),
    ("Tìm khách sạn gần nhà ga T3",nearby,"RECOMMEND_HOTELS",None),
]
results=[]
for question,state,intent,expected_origin in cases:
    start=time.monotonic()
    decision=dialogue.classify(question,False,conversation=state)
    slots=decision.get("slots") or {}
    passed=decision["intent"]==intent
    if intent=="DIRECTIONS": passed=passed and decision["action"]=="NONE" and not slots.get("landmark")
    if expected_origin is not None: passed=passed and slots.get("origin")==expected_origin
    if question.isdigit(): passed=passed and not slots.get("origin")
    if question=="Nên ưu tiên khách sạn nào": passed=passed and decision["action"]=="CHOOSE_OPTION"
    results.append({"question":question,"state":state,"passed":passed,"seconds":round(time.monotonic()-start,3),"expected":{"intent":intent,"origin":expected_origin},"decision":decision})
    print(json.dumps(results[-1],ensure_ascii=True),flush=True)
report={"freshInference":True,"remoteInference":False,"passed":sum(r["passed"] for r in results),"total":len(results),"results":results}
Path("/tmp/directions-evaluation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if all(r["passed"] for r in results) else 1)
