"""Fresh local-model checks: a city clarifies a pending POI without replacing it."""
import json
import os
import sys
from pathlib import Path
sys.path.insert(0,os.environ.get("SEMANTIC_SOURCE_DIR","/app"))
import dialogue

state={"lastIntent":"RECOMMEND_HOTELS","displayedHotels":0,"pendingSlot":"landmark","recentUserQuestions":["Có khách sạn nào gần nhà ga T1 không","Nhà ga T1"]}
cases=[(q,None,"Hồ Chí Minh") for q in ("SÀI GÒN","SÀI GÒN","SAIGON","ở Sài Gòn","HCM","TP.HCM","Ho Chi Minh City")]
cases += [("Nhà ga T1","nha ga t1",None),("Nhà ga T3","nha ga t3",None),("Bệnh viện Chợ Rẫy","benh vien cho ray",None)]
results=[]
for question,poi,city in cases:
    decision=dialogue.classify(question,False,conversation=state)
    slots=decision.get("slots") or {}
    passed=decision["intent"]=="RECOMMEND_HOTELS"
    if city: passed=passed and slots.get("city")==city and not slots.get("landmark") and decision["action"]=="REFINE_SEARCH"
    if poi: passed=passed and slots.get("landmark")==poi
    results.append({"question":question,"passed":passed,"expected":{"landmark":poi,"city":city},"decision":decision})
    print(json.dumps(results[-1],ensure_ascii=True),flush=True)
report={"freshInference":True,"remoteInference":False,"passed":sum(r["passed"] for r in results),"total":len(results),"results":results}
Path("/tmp/place-identity.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if all(r["passed"] for r in results) else 1)
