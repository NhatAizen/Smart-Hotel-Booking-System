"""Evaluate the real router, or replay recorded decisions through current evidence checks."""
import argparse
import hashlib
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from grounding import validate
from dialogue import MODEL, REVISION, SYSTEM

parser=argparse.ArgumentParser()
parser.add_argument("dataset")
parser.add_argument("--replay",help="Recorded API decisions; tests postprocessing without loading model weights")
parser.add_argument("--output")
args=parser.parse_args()
folder=Path(__file__).parent
catalog=json.loads((folder/"intents.json").read_text(encoding="utf-8"))
cases=json.loads(Path(args.dataset).read_text(encoding="utf-8"))
recorded={}
if args.replay:
    previous=json.loads(Path(args.replay).read_text(encoding="utf-8-sig"))
    if previous.get("promptSha256") and previous["promptSha256"]!=hashlib.sha256(SYSTEM.encode()).hexdigest():
        raise ValueError("Prompt changed: refresh recorded decisions with fresh local inference")
    recorded_messages={row["id"]:row["message"] for row in previous["cases"]}
    recorded={row["id"]:row.get("recordedDecision",row["decision"]) for row in previous["cases"]}
else:
    from app import SemanticRouter
    router=SemanticRouter(os.environ.get("MODEL_DIR","/models/e5"),str(folder/"intents.json"))
results=[]
references={text for item in catalog["intents"] for text in item["texts"]}
references.update(text for values in catalog["actions"].values() for text in values)
for case in cases:
    started=time.monotonic()
    if args.replay:
        if case["id"] not in recorded: raise ValueError("Missing recorded decision: "+case["id"])
        if recorded_messages[case["id"]]!=case["message"]: raise ValueError("Question changed: fresh inference required")
        original=json.loads(json.dumps(recorded[case["id"]]))
        if original["model"]!=MODEL or original["revision"]!=REVISION: raise ValueError("Recorded model revision mismatch")
        decision=validate(case["message"],json.loads(json.dumps(original)))
    else:
        decision=router.classify(case["message"],case.get("hotelContext",False))
        original=json.loads(json.dumps(decision))
    errors={key:{"expected":case[key],"actual":decision.get(key)} for key in ("intent","topic","action","behavior","preference") if key in case and case[key]!=decision.get(key)}
    for key,expected in case.get("slots",{}).items():
        actual=(decision.get("slots") or {}).get(key)
        matches=set(expected).issubset(actual or []) if isinstance(expected,list) else expected==actual
        if not matches: errors["slots."+key]={"expected":expected,"actual":actual}
    if case.get("unsupported") and not (decision.get("slots") or {}).get("unsupportedConstraints"):
        errors["unsupportedConstraints"]="Must acknowledge an unsupported constraint"
    results.append({**case,"passed":not errors,"decision":decision,"recordedDecision":original,"errors":errors,"durationSeconds":round(time.monotonic()-started,3),"verbatimReference":case["message"] in references})
    if len(results)%10==0: print(f"Evaluated {len(results)}/{len(cases)}",file=sys.stderr,flush=True)
counts=Counter(row["family"] for row in results)
report={"generatedAt":datetime.now(timezone.utc).isoformat(),"mode":"RECORDED_DECISION_REPLAY" if args.replay else "FRESH_LOCAL_INFERENCE","model":MODEL,"revision":REVISION,
        "promptSha256":hashlib.sha256(SYSTEM.encode()).hexdigest(),"validatorSha256":hashlib.sha256((folder/"grounding.py").read_bytes()).hexdigest(),
        "total":len(results),"passed":sum(row["passed"] for row in results),"verbatimReferences":sum(row["verbatimReference"] for row in results),
        "families":{family:{"total":count,"passed":sum(row["passed"] for row in results if row["family"]==family)} for family,count in counts.items()},"cases":results}
encoded=json.dumps(report,ensure_ascii=False,indent=2)
if args.output: Path(args.output).write_text(encoded,encoding="utf-8")
else: print(encoded)
if report["passed"]!=report["total"]: sys.exit(1)
