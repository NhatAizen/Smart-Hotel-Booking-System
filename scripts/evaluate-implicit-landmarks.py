"""Check omitted proximity words without requiring individual landmark examples."""
import json
import os
import sys
from pathlib import Path
sys.path.insert(0,os.environ.get("SEMANTIC_SOURCE_DIR","/app"))
import dialogue

cases=[
    ("tôi muốn tìm khách sạn nhà ga T3","nha ga t3"),
    ("Tôi cần khách sạn sân bay Tân Sơn Nhất","san bay tan son nhat"),
    ("Tìm chỗ nghỉ bệnh viện Chợ Rẫy","benh vien cho ray"),
    ("Tôi tìm khách sạn trường đại học Văn Lang","truong dai hoc van lang"),
    ("Cần khách sạn bến xe Miền Đông","ben xe mien dong"),
    ("Tìm khách sạn nhà hát Thành phố","nha hat thanh pho"),
    ("Tìm khách sạn chợ Bến Thành","cho ben thanh"),
    ("Tìm khách sạn nhà ga T3 ở Sài Gòn","nha ga t3"),
]
results=[]
for message,place in cases:
    decision=dialogue.classify(message)
    slots=decision.get("slots") or {}
    passed=decision["intent"]=="RECOMMEND_HOTELS" and slots.get("landmark")==place and decision["action"]=="NEW_SEARCH" and not slots.get("unsupportedConstraints")
    results.append({"message":message,"passed":passed,"decision":decision})
    print(json.dumps(results[-1],ensure_ascii=True),flush=True)
report={"freshInference":True,"remoteInference":False,"passed":sum(r["passed"] for r in results),"total":len(results),"results":results}
Path("/tmp/implicit-landmarks.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if all(r["passed"] for r in results) else 1)
