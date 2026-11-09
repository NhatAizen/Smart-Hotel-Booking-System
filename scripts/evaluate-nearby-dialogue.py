"""Fresh semantic checks for switching capability and arbitrary proximity relations."""
import json
import time
import urllib.request
from pathlib import Path

cases = [
    ("tôi cần khách sạn ở gần nhà ga t3", "RECOMMEND_HOTELS", "nha ga t3", None),
    ("Tìm khách sạn quanh Bệnh viện Chợ Rẫy", "RECOMMEND_HOTELS", "benh vien cho ray", None),
    ("Tôi muốn ở gần Trường Đại học Văn Lang", "RECOMMEND_HOTELS", "truong dai hoc van lang", None),
    ("Tôi muốn ở gần nhà ga T3", "RECOMMEND_HOTELS", "nha ga t3", None),
    ("Khách sạn cạnh Nhà hát Tháng Sáu có không?", "RECOMMEND_HOTELS", "nha hat thang sau", None),
    ("Hotels within 2 km of City Hall", "RECOMMEND_HOTELS", "city hall", 2),
    ("Tìm khách sạn gần Chợ Bến Thành trong 500m", "RECOMMEND_HOTELS", "cho ben thanh", .5),
    ("Khách sạn cách Nhà hát Thành phố 2km", "RECOMMEND_HOTELS", "nha hat thanh pho", 2),
    ("Tìm khách sạn gần bệnh viện", "RECOMMEND_HOTELS", "benh vien", None),
    ("Tôi cần khách sạn ở Đà Nẵng", "RECOMMEND_HOTELS", None, None),
    ("Đổi sang tìm chỗ nghỉ tại Huế", "RECOMMEND_HOTELS", None, None),
    ("Tôi muốn khách sạn Quận 1", "RECOMMEND_HOTELS", None, None),
    ("ở đây có những loại phòng nào", "ROOM_RECOMMEND", None, None),
    ("Có phòng nào rẻ hơn không", "ROOM_RECOMMEND", None, None),
    ("Tôi quên mật khẩu thì làm sao", "GENERAL", None, None),
    ("Tôi có những đơn đặt phòng nào", "MY_BOOKINGS", None, None),
    ("Viết bài văn về bóng đá", "OUT_OF_SCOPE", None, None),
    ("Bán kính 2 km thôi", "RECOMMEND_HOTELS", None, 2),
    ("Bỏ điều kiện gần nhà ga", "RECOMMEND_HOTELS", None, None),
    ("có khách sạn nào gần nhà ga t3 không", "RECOMMEND_HOTELS", "nha ga t3", None),
    ("Có khách sạn gần Bệnh viện Chợ Rẫy không nhỉ?", "RECOMMEND_HOTELS", "benh vien cho ray", None),
    ("Khách sạn gần Trường Đại học Văn Lang có chưa?", "RECOMMEND_HOTELS", "truong dai hoc van lang", None),
]
pending_cases = [
    ("Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất", "RECOMMEND_HOTELS", "nha ga t3 - cang hang khong quoc te tan son nhat", None),
    ("Nhà ga T3 của sân bay Tân Sơn Nhất", "RECOMMEND_HOTELS", "nha ga t3 cua san bay tan son nhat", None),
    ("Bệnh viện Chợ Rẫy", "RECOMMEND_HOTELS", "benh vien cho ray", None),
    ("Trường Đại học Văn Lang", "RECOMMEND_HOTELS", "truong dai hoc van lang", None),
    ("Hồ Chí Minh", "RECOMMEND_HOTELS", None, None),
    ("Tôi quên mật khẩu thì làm sao", "GENERAL", None, None),
    ("Tôi có những đơn đặt phòng nào", "MY_BOOKINGS", None, None),
    ("Tìm khách sạn ở Đà Nẵng", "RECOMMEND_HOTELS", None, None),
    ("Viết bài văn về bóng đá", "OUT_OF_SCOPE", None, None),
]
results = []
for index,(question,intent,landmark,radius) in enumerate(cases+pending_cases):
    pending=index>=len(cases)
    state={"lastIntent":"RECOMMEND_HOTELS","displayedHotels":0,"pendingSlot":"landmark","recentUserQuestions":["có khách sạn nào gần nhà ga t3 không"]} if pending else {"lastIntent":"ROOM_RECOMMEND","displayedHotels":1,"recommendedHotels":3,"recentUserQuestions":["ở đây có những loại phòng nào"]}
    body={"message":question,"hotelContext":not pending,"conversation":state}
    request=urllib.request.Request("http://127.0.0.1:8091/classify",json.dumps(body).encode(),{"Content-Type":"application/json"})
    start=time.monotonic()
    with urllib.request.urlopen(request,timeout=60) as response: decision=json.load(response)
    slots=decision.get("slots") or {}
    passed=decision["intent"]==intent and (landmark is None or slots.get("landmark")==landmark) and (radius is None or slots.get("radiusKm")==radius)
    if landmark: passed=passed and decision["action"]=="NEW_SEARCH" and not slots.get("unsupportedConstraints")
    if pending and landmark is None: passed=passed and not slots.get("landmark")
    result={"question":question,"pendingLandmark":pending,"expected":{"intent":intent,"landmark":landmark,"radiusKm":radius},"passed":passed,"seconds":round(time.monotonic()-start,3),"decision":decision}
    results.append(result)
    print(json.dumps(result,ensure_ascii=True),flush=True)
report={"freshInference":True,"remoteInference":False,"passed":sum(r["passed"] for r in results),"total":len(results),"results":results}
Path("/tmp/nearby-evaluation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if all(r["passed"] for r in results) else 1)
