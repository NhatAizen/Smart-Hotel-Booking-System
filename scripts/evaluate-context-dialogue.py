"""Run inside the disposable semantic-service container; records fresh local inference."""
import json
import time
import urllib.request
from pathlib import Path

state = {"lastIntent":"COMPARE_HOTELS", "displayedHotels":2,"recommendedHotels":3}
cases = [
    ("nên ưu tiên khách sạn nào", "COMPARE_HOTELS", "CHOOSE_OPTION", "BALANCED", []),
    ("Nếu là bạn thì bạn chọn nơi nào?", "COMPARE_HOTELS", "CHOOSE_OPTION", "BALANCED", []),
    ("Chốt lại tôi nên ở đâu trong hai chỗ này?", "COMPARE_HOTELS", "CHOOSE_OPTION", "BALANCED", []),
    ("Cái nào đáng chọn hơn cho vợ con tôi?", "COMPARE_HOTELS", "CHOOSE_OPTION", "FAMILY", []),
    ("2 khách sạn bạn so sánh đấy", "COMPARE_HOTELS", "CHOOSE_OPTION", "BALANCED", ["nên ưu tiên khách sạn nào"]),
    ("Hai chỗ vừa rồi ấy", "COMPARE_HOTELS", "CHOOSE_OPTION", "QUALITY", ["Tôi nên ưu tiên nơi nào về chất lượng dịch vụ?"]),
    ("Trong nhóm đó thôi", "COMPARE_HOTELS", "CHOOSE_OPTION", "CHEAPEST", ["Tôi nên chọn khách sạn nào để tiết kiệm?"]),
    ("Chọn giúp nơi có dịch vụ tốt hơn", "COMPARE_HOTELS", "CHOOSE_OPTION", "QUALITY", []),
    ("Nếu chỉ xét chi phí thì nên chọn bên nào?", "COMPARE_HOTELS", "CHOOSE_OPTION", "CHEAPEST", []),
    ("Ưu tiên chỗ có bữa sáng thì chọn ai?", "COMPARE_HOTELS", "CHOOSE_OPTION", "BREAKFAST", []),
    ("Tôi muốn linh hoạt hoàn tiền, nên chọn nơi nào?", "COMPARE_HOTELS", "CHOOSE_OPTION", "REFUNDABLE", []),
    ("So sánh hai khách sạn đầu tiên", "COMPARE_HOTELS", "NONE", None, []),
    ("so sánh khách sạn 1,3", "COMPARE_HOTELS", "NONE", None, []),
    ("so sánh cả 3 khách sạn xem", "COMPARE_HOTELS", "NONE", None, []),
    ("so sánh chất lượng ấy", "COMPARE_HOTELS", "NONE", None, []),
    ("còn khách sạn nào khác không", "RECOMMEND_HOTELS", "MORE_HOTELS", None, []),
    ("Đổi sang tìm khách sạn Đà Nẵng", "RECOMMEND_HOTELS", "NEW_SEARCH", None, ["Nên ưu tiên nơi nào?"]),
    ("Tôi quên mật khẩu thì làm sao?", "GENERAL", "NONE", None, ["Nên chọn nơi nào?"]),
    ("Viết bài văn về bóng đá", "OUT_OF_SCOPE", "NONE", None, []),
    ("Tôi có những đơn đặt phòng nào?", "MY_BOOKINGS", "NONE", None, []),
]
results=[]
for attempt in range(60):
    try:
        urllib.request.urlopen("http://127.0.0.1:8091/health",timeout=2).close()
        break
    except OSError:
        time.sleep(1)
else:
    raise RuntimeError("Semantic candidate did not become ready")
for question,intent,action,preference,history in cases:
    body={"message":question,"hotelContext":False,"conversation":{**state,"recentUserQuestions":history}}
    request=urllib.request.Request("http://127.0.0.1:8091/classify",json.dumps(body).encode(),{"Content-Type":"application/json"})
    start=time.monotonic()
    with urllib.request.urlopen(request,timeout=60) as response: decision=json.load(response)
    passed=decision["intent"]==intent and decision["action"]==action and (preference is None or decision["preference"]==preference)
    result={"question":question,"history":history,"seconds":round(time.monotonic()-start,3),"passed":passed,"expected":{"intent":intent,"action":action,"preference":preference},"decision":decision}
    results.append(result)
    print(json.dumps({**{k:result[k] for k in ("question","seconds","passed")},"intent":decision["intent"],"action":decision["action"],"preference":decision["preference"]},ensure_ascii=False),flush=True)
    Path("/tmp/context-evaluation.json").write_text(json.dumps({"results":results},ensure_ascii=False,indent=2))
report={"freshInference":True,"remoteInference":False,"passed":sum(r["passed"] for r in results),"total":len(results),"results":results}
Path("/tmp/context-evaluation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if all(r["passed"] for r in results) else 1)
