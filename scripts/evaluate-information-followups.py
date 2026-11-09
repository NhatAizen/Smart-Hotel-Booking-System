"""Fresh checks that a new information request supersedes the previous group task."""
import json, urllib.request
from pathlib import Path
cases=[
    ("Cho tôi tọa độ khách sạn số 3 với Nhà ga T1 đi","DIRECTIONS"),
    ("Cho tôi số điện thoại khách sạn số 2","HOTEL_DETAILS"),
    ("Cho tôi địa chỉ khách sạn thứ ba","HOTEL_DETAILS"),
    ("Cho biết giờ nhận phòng khách sạn này","HOTEL_DETAILS"),
    ("Khách sạn số 3 có những loại phòng nào?","ROOM_RECOMMEND"),
    ("So sánh khách sạn 1 và 3","COMPARE_HOTELS"),
    ("Nên ưu tiên khách sạn nào?","COMPARE_HOTELS"),
    ("Tôi quên mật khẩu thì làm sao?","GENERAL"),
    ("Tìm khách sạn ở Đà Nẵng","RECOMMEND_HOTELS"),
]
results=[]
for last in ("RECOMMEND_HOTELS","COMPARE_HOTELS"):
    for question,intent in cases:
        body={"message":question,"hotelContext":False,"conversation":{"lastIntent":last,"displayedHotels":3,"recentUserQuestions":["So sánh các khách sạn vừa giới thiệu"]}}
        request=urllib.request.Request("http://127.0.0.1:8091/classify",json.dumps(body).encode(),{"Content-Type":"application/json"})
        with urllib.request.urlopen(request,timeout=60) as response: decision=json.load(response)
        row={"question":question,"lastIntent":last,"expected":intent,"decision":decision,"passed":decision["intent"]==intent}
        results.append(row)
        print(json.dumps(row,ensure_ascii=True),flush=True)
report={"freshInference":True,"passed":sum(r["passed"] for r in results),"total":len(results),"results":results}
Path("/tmp/information-followups.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report["passed"]==report["total"] else 1)
