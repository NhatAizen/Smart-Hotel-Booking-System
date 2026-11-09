"""Evidence checks for user-provided search constraints; never creates hotel facts."""
import re
import unicodedata
from decimal import Decimal

def norm(text):
    return "".join(c for c in unicodedata.normalize("NFD", str(text).lower().replace("đ","d")) if not unicodedata.combining(c))

AMENITIES = {
    "Hồ bơi": ["ho boi","be boi","pool"],
    "WiFi": ["wifi","wi-fi","wi fi"],
    "Bữa sáng": ["bua sang","an sang","breakfast"],
    "Bãi đỗ xe": ["bai do xe","cho do xe","do xe","bai xe","parking"],
    "Phòng gym": ["gym","phong tap"],
    "Spa": ["spa"],
    "Điều hòa": ["dieu hoa","may lanh","air conditioning"],
}
CITIES = ["Đà Lạt","Hồ Chí Minh","Hà Nội","Đà Nẵng","Nha Trang","Vũng Tàu","Phú Quốc","Huế","Hội An","Quy Nhơn","Cần Thơ","Sa Pa","Hạ Long","Phan Thiết","Bắc Ninh","Hải Phòng","Vinh","Buôn Ma Thuột"]

def city_reply(message):
    """Typed region answer: a city alias cannot become a replacement POI."""
    value=norm(message).strip(" .,!?:;")
    value=re.sub(r"(?:\s+(?:nhe|nha|a|thoi|di|vay))+$","",value)
    cities={norm(city):city for city in CITIES}
    cities.update({alias:"Hồ Chí Minh" for alias in ("sai gon","saigon","hcm","tphcm","tp.hcm","tp hcm","ho chi minh city")})
    cities.update({"hanoi":"Hà Nội","hanoi city":"Hà Nội","danang":"Đà Nẵng","da nang city":"Đà Nẵng"})
    if value in cities: return cities[value]
    value=re.sub(r"^(?:(?:toi|minh)\s+)?(?:(?:muon|can|di)\s+)?(?:(?:o|tai|la|thanh pho|tp\.?)\s+)*","",value)
    return cities.get(value)
DIGITS = dict(zip(["khong","mot","hai","ba","bon","tu","nam","lam","sau","bay","tam","chin"],[0,1,2,3,4,4,5,5,6,7,8,9]))
REMOVE = r"\b(?:bo|go|khong can|khong yeu cau|khong doi|dung bat buoc|chang can|khong gioi han|khong han che|khong(?: con)? (?:dat|ap dung|giu) (?:tran|gioi han|dieu kien|yeu cau))\b(?:\s+(?:yeu cau|dieu kien|co|tien nghi))*"
SEARCH = {"RECOMMEND_HOTELS","ROOM_RECOMMEND","ROOM_COMPARE","COMPARE_HOTELS"}

def mentioned(text, aliases):
    return any(re.search(r"(?<!\w)"+re.escape(alias)+r"(?!\w)",text) for alias in aliases)


def followup_operation(message, previous_questions, operation):
    """Validate a speech act against its explicit verbs and the preceding goal.

    This guard only operates inside an already-resolved hotel comparison. It
    cannot turn a new task (PARSE) into advice, search, or a write operation.
    """
    if operation not in ("COMPARE", "ADVISE"):
        return operation
    text = norm(message)
    def advice(question):
        verb = r"(?:chon|uu tien|chot|choose|pick|prioritize|recommend)"
        if re.search(r"\b(?:khong|dung|don't|do not)\s+(?:(?:can|muon)\s+)?"+verb+r"\b",question):
            return False
        if re.match(r"^"+verb+r"\b",question.strip()):
            return True
        markers = re.finditer(r"\b(?:nen|hay|giup|muon|can|should|would|please)\b((?:\s+\w+){0,6})\s+"+verb+r"\b",question)
        return any(not mentioned(match[1],["so sanh","compare","doi chieu","tim","search"]) for match in markers)
    if advice(text):
        return "ADVISE"
    # A command to compare supersedes an earlier request for advice. A relative
    # clause referring to what was compared does not create a new task.
    compare_command = re.match(r"^(?:(?:ban|hay|giup|vui long|lam on|please|can you)\s+)*(?:so sanh|compare|doi chieu)\b",text.strip())
    if compare_command:
        return "COMPARE"
    # A new information request owns its task. A displayed group or an older
    # advice question cannot turn retrieval into a comparison/advice reply.
    if re.match(r"^(?:cho toi|cho minh|toi hoi|toi muon biet|cho biet|xem|what|where|when|give|show|tell)\b",text.strip()):
        return "PARSE"
    previous = norm(previous_questions[-1]) if previous_questions else ""
    reference = mentioned(text,["khach san","nhom","cho","hai","2","do","day","vua","those","ones","them"])
    if reference and advice(previous):
        return "ADVISE"
    return operation

def under_thousand(tokens):
    total, current = Decimal(0), Decimal(0)
    for token in tokens:
        if token in DIGITS: current=Decimal(DIGITS[token])
        elif re.fullmatch(r"\d+(?:[.,]\d+)?",token): current=Decimal(token.replace(",","."))
        elif token=="tram": total += (current or 1)*100; current=Decimal(0)
        elif token=="muoi": total += (current or 1)*10; current=Decimal(0)
    return total+current

def money(text):
    explicit=re.search(r"(?<!\w)([0-9][0-9., ]{3,})\s*(?:vnd|dong|d|₫)(?!\w)",text)
    if explicit: return int(re.sub(r"\D","",explicit[1]))
    # A reusable Vietnamese numeral parser: both decimal units and written amounts.
    numeric = r"(?:\d+(?:[.,]\d+)?|khong|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi|tram|linh|le|ruoi)"
    unit = r"(?:trieu|nghin|ngan|tr|k)"
    match = re.search(r"(?<!\w)("+numeric+r"(?:\s+(?:"+numeric+"|"+unit+r"))*\s*"+unit+r"(?:\s+ruoi)?)(?!\w)",text)
    if not match: return None
    tokens=re.findall(r"\d+(?:[.,]\d+)?|[a-z]+",match.group(1))
    total, pending, last_scale = Decimal(0), [], Decimal(0)
    for token in tokens:
        if token in ("trieu","tr","nghin","ngan","k"):
            last_scale=Decimal(1000000 if token in ("trieu","tr") else 1000)
            total+=under_thousand(pending)*last_scale; pending=[]
        elif token=="ruoi" and last_scale: total+=last_scale/2
        else: pending.append(token)
    return int(total+under_thousand(pending))

def removal(clause, aliases):
    pattern=r"(?<!\w)(?:"+"|".join(re.escape(alias) for alias in aliases)+r")(?!\w)"
    feature=re.search(pattern,clause)
    if not feature: return False
    # A negated operator can include a modifier that is also part of the entity,
    # e.g. the cap in a budget-cap expression. Keep that dependency intact.
    if any(operator.start() <= feature.start() < operator.end() for operator in re.finditer(REMOVE,clause[:feature.end()])):
        return True
    operators=list(re.finditer(REMOVE+r"|\b(?:giu|them|can|yeu cau|co|muon|bat buoc)\b",clause[:feature.start()]))
    if operators: return re.fullmatch(REMOVE,operators[-1][0]) is not None
    return re.search(REMOVE,clause[feature.end():]) is not None


def landmark_text(value, question=False):
    """Remove a terminal question particle, never words inside a place name."""
    value=norm(value).strip(" \t\r\n.,;?!\"'“”")
    if question:
        value=re.sub(r"\s+(?:co\s+)?(?:khong|chua)(?:\s+(?:a|ha|nhi|nhe|vay|ban|anh|chi))*$","",value)
    return value.strip()

def proximity_slots(message, lodging_task=False):
    """Extract the relation/target, not a list of individual landmark names."""
    text=norm(message)
    clear=bool(re.search(r"\b(?:khong can|bo|go|khong yeu cau)\b.*\b(?:gan|khoang cach|ban kinh)\b",text))
    if clear: return {"clearNearby":True}
    relation=re.search(r"\b(?:gan|quanh|canh|cach|near|close to|around|beside|within\s+[\d.,]+\s*(?:km|m)\s+of)\s+(.+)",text)
    catalog_before=relation and mentioned(text[:relation.start()],["khach san","cho nghi","noi o","hotel","hotels","accommodation"])
    implied=bool(re.match(r"^(?:(?:toi|minh|muon|can|o|doi|sang|the|vay|thi|cho)\s+)*(?:gan|quanh|canh|cach|near|around|close to|within)\b",text.strip()))
    other_task=relation and mentioned(text[:relation.start()],["nha hang","quan an","restaurant","chi duong","duong di","directions"])
    implicit_target=None
    if not relation:
        subject=re.search(r"\b(?:khach san|cho nghi|noi nghi|noi o|hotels?|accommodation)\b",text)
        if subject:
            prefix=text[:subject.start()]
            discovery=lodging_task or mentioned(prefix,["tim","can","muon","goi y","de xuat","find","need","want","looking for"])
            procedure=mentioned(prefix,["cach dat","huong dan","quy trinh","thu tuc","tao","quan ly",
                "don","booking","da dat","dat roi","lich su","reservation","booked","danh gia","review","nhan xet","so sanh","compare","doi chieu"])
            rest=re.sub(r"^(?:(?:o|tai|khu vuc|khu|in|at|by)\s+)*","",text[subject.end():].strip())
            kind=r"(?:nha ga|ga|terminal|san bay|cang hang khong|benh vien|truong dai hoc|dai hoc|ben xe|ben tau|nha hat|bao tang|cong vien|san van dong|trung tam thuong mai|trung tam hoi nghi|khu cong nghiep)"
            if re.search(r"\bchợ\b",unicodedata.normalize("NFC",str(message)).lower()): kind=r"(?:"+kind+r"|cho)"
            if discovery and not procedure and re.match(r"^"+kind+r"\s+\S",rest): implicit_target=rest
    slots={}
    if implicit_target or relation and not other_task and (catalog_before or implied or lodging_task):
        target=re.split(r"[,;?!]|\b(?:voi ngan sach|ngan sach|gia duoi|duoi \d|cho \d|cho gia dinh|co ho boi|va co|co khong|duoc khong|thi sao|di nhe)\b",implicit_target or relation[1])[0].strip(" .")
        # City is a disambiguating slot, not part of the landmark's name.
        city_names=[norm(city) for city in CITIES]+["sai gon","hcm","tp.hcm","tp hcm"]
        target=re.split(r"\s+(?:o|tai|in)\s+(?:(?:thanh pho|tp\.?)\s+)?(?:"+"|".join(re.escape(city) for city in city_names)+r")(?:\b|$)",target)[0].strip()
        target=re.sub(r"\s+(?:trong|duoi|tam|khoang|ban kinh|within|under).*(?:km|m|met|meters?|kilometres?)\b.*$","",target).strip()
        target=re.sub(r"\s+\d+(?:[.,]\d+)?\s*(?:km|kilomet(?:er|re)s?|met|meters?|m)\b.*$","",target).strip()
        target=landmark_text(target,question=True)
        if target: slots["landmark"]=target[:160]
    distance=re.search(r"(?<!\w)(-?\d+(?:[.,]\d+)?)\s*(km|kilomet(?:er|re)s?|met|meters?|m)\b",text)
    if distance and not other_task and (slots.get("landmark") or mentioned(text,["ban kinh","radius"])):
        value=float(distance[1].replace(",",".")) / (1000 if distance[2] in ("met","meter","meters","m") else 1)
        if .1<=value<=100: slots["radiusKm"]=value
        else: slots["unsupportedConstraints"]=["bán kính ngoài khoảng hỗ trợ 0,1–100 km"]
        if re.search(r"\b(?:dung|chinh xac|exactly)\s+-?\d",text):
            slots["unsupportedConstraints"]=["khoảng cách chính xác tuyệt đối (chỉ hỗ trợ bán kính đường chim bay)"]
    if slots.get("landmark") and mentioned(text,["phut","minutes","di bo","lai xe","duong bo","driving","walking"]):
        slots["unsupportedConstraints"]=["thời gian hoặc quãng đường di chuyển thực tế"]
    return slots

def directions_requested(message):
    text=norm(message)
    if re.search(r"\b(?:khong can|dung|do not|don't)\s+(?:chi duong|dan duong|navigate|show directions)\b",text): return False
    explicit=mentioned(text,["chi duong","dan duong","duong di","lo trinh","cach di den","xuat phat","di tu","directions","navigate","route"])
    if mentioned(text,["toa do","vi do","kinh do","gps","coordinates","coordinate","latitude","longitude"]) and not re.search(r"\b(?:khong can|dung|do not)\s+(?:toa do|gps|coordinates?)\b",text): return True
    endpoints=re.search(r"\b(?:tu|from)\s+.+?\s+(?:den|toi|to)\s+.+",text)
    return bool(explicit or endpoints and (mentioned(text,["dia chi","khach san","hotel","di the nao","di nhu the nao","mat bao lau","may phut","how"])) )

def validate(message, result, conversation=None):
    text=norm(message)
    route_request=directions_requested(message)
    if isinstance(conversation,dict) and conversation.get("lastIntent")=="DIRECTIONS" and re.fullmatch(r"\s*\d{1,3}[.!?]?\s*",text):
        # A numeric reply selects the visible hotel, never a geocoding query.
        route_request=True
        result["slots"]={key:value for key,value in (result.get("slots") or {}).items() if key!="origin"}
    if route_request: result.update(intent="DIRECTIONS",topic=None,action="NONE")
    elif proximity_slots(message,result["intent"]=="RECOMMEND_HOTELS"):
        # A spatial lodging constraint is a search; only a route speech act can
        # turn it into directions. The independently predicted label cannot.
        result.update(intent="RECOMMEND_HOTELS",topic=None)
    elif (re.search(r"\b(?:doi|chuyen|change|switch)\b.*\b(?:sang|to)\b",text)
            and mentioned(text,["tim","search","find"])
            and (any(mentioned(text,[norm(city)]) for city in CITIES)
                 or (result.get("slots") or {}).get("city") and norm(result["slots"]["city"]) in text)):
        result.update(intent="RECOMMEND_HOTELS",topic=None,action="NEW_SEARCH")
    comparison_evidence = mentioned(text,["so sanh","compare","doi chieu","khac nhau","khac gi","chenh lech","hon kem","versus","vs"])
    # Attribute/entity relations have an API capability of their own. Ordinal
    # resolution below must not replace that capability with a generic overview.
    property_subject=mentioned(text,["khach san","hotel","hotels","ks"])
    procedure_question=mentioned(text,["quy trinh","thu tuc","huong dan","cach nhan","cach tra"])
    if result["intent"] in SEARCH | {"CLARIFY","HOTEL_DETAILS"} and result["action"]!="CHOOSE_OPTION" and property_subject and not comparison_evidence and not procedure_question:
        if mentioned(text,["loai phong","room types"]) and mentioned(text,["nao","nhung","cac","co","list","types"]):
            result.update(intent="ROOM_RECOMMEND",topic=None,action="NONE")
        elif mentioned(text,["dia chi","dien thoai","hotline","lien he","email","address","phone","telephone","gio nhan phong","gio tra phong"]):
            result.update(intent="HOTEL_DETAILS",topic=None,action="NONE")
    if result["intent"] in ("ROOM_COMPARE","COMPARE_HOTELS") and mentioned(text,["phong","loai phong","rooms","room types"]) and not mentioned(text,["khach san","hotels"]):
        result["intent"]="ROOM_COMPARE"
    alternative_evidence = mentioned(text,["khac","them","nua","tiep","other","another","more"])
    pair_evidence=re.search(r"\b(?:hai|ba|bon|[2-9])\s+(?:loai\s+)?phong\b",text)
    if result["intent"]=="ROOM_COMPARE" and not comparison_evidence and not pair_evidence:
        # Listing types or asking for a cheaper/bigger option is recommendation.
        # A comparison requires multiple explicit subjects or a comparison act.
        result["intent"]="ROOM_RECOMMEND"
    if result["action"] != "CHOOSE_OPTION" and result["intent"] in ("COMPARE_HOTELS", "ROOM_COMPARE") and (comparison_evidence or not alternative_evidence):
        result["action"] = "NONE"
    # Check relations and task objects independently of the predicted label.
    # These rules use capability concepts, never stored full user utterances.
    ordinal = re.search(r"\b(?:thu|so|lua chon|phuong an)\s*(?:nhat|mot|hai|ba|1|2|3)\b",text)
    temporal_update = mentioned(text,["ngay","lich","thoi gian"]) and mentioned(text,["doi","sua","thay","moi","cap nhat"])
    recheck = temporal_update and mentioned(text,["kiem tra","tra lai","tim lai","cap nhat","xem lai"])
    if ordinal and result["intent"] not in ("ROOM_COMPARE","COMPARE_HOTELS","DIRECTIONS"):
        # Resolve WHICH property independently of WHAT was asked about it.
        task=result["intent"] if result["intent"] in ("HOTEL_DETAILS","ROOM_RECOMMEND") else "CLARIFY"
        result.update(intent=task,topic=None,action="SELECT_OPTION")
    elif recheck:
        result.update(intent="CLARIFY",topic=None,action="RECHECK_TRIP")
    procedure = mentioned(text,["quy trinh","cac buoc","thu tuc","huong dan"])
    # An explicit request to continue a public lodging list is not permission
    # to read personal bookings. Keep the task object separate from pagination.
    catalog = mentioned(text,["khach san","cho nghi","noi nghi","hotels","accommodation"])
    owned_booking = mentioned(text,["don","booking","da dat","dat truoc","lich su dat","reservation","booked"])
    list_request = alternative_evidence and mentioned(text,["xem","goi y","gioi thieu","show","list"])
    # Pagination must use the explicitly named entity type, not a model's
    # independent hotel/room label. Do not reinterpret private booking tasks.
    if result["intent"] in SEARCH | {"CLARIFY"} and result["action"] in ("MORE_HOTELS","MORE_ROOMS","MORE_OPTIONS") and not owned_booking and not procedure:
        room_object=mentioned(text,["phong","loai phong","room","rooms","room types"])
        if room_object and not catalog:
            result.update(intent="ROOM_RECOMMEND",topic=None,action="MORE_ROOMS")
        elif catalog and not room_object:
            result.update(intent="RECOMMEND_HOTELS",topic=None,action="MORE_HOTELS")
    if result["intent"] == "MY_BOOKINGS" and catalog and list_request and not owned_booking and not procedure:
        result.update(intent="RECOMMEND_HOTELS",topic=None,action="MORE_HOTELS")
    if procedure and mentioned(text,["tra phong","check out","checkout"]):
        result.update(intent="GENERAL",topic="CHECK_OUT",action="NONE")
    elif procedure and mentioned(text,["nhan phong","check in","checkin"]):
        result.update(intent="GENERAL",topic="CHECK_IN",action="NONE")
    if (mentioned(text,["doi","thay","chuyen"]) and mentioned(text,["phong","loai phong"])
            and mentioned(text,["da dat","dat roi","don dat","booking"])
            and mentioned(text,["lam sao","the nao","cach","huong dan","thu tuc"])):
        result.update(intent="GENERAL",topic="ROOM_CHANGE",action="NONE")
    if mentioned(text,["cho meo","thu cung","vat nuoi","hut thuoc","to chuc tiec"]):
        if result["intent"] not in SEARCH:
            result.update(intent="GENERAL",topic="POLICY",action="NONE")
    review_evidence = mentioned(text,["danh gia","review","nhan xet","khach truoc","nguoi truoc","phan hoi","khen","che","phan nan","y kien","khach da luu tru"])
    if result["intent"]=="REVIEW_SUMMARY" and not review_evidence:
        if mentioned(text,["phong","loai phong"]) and mentioned(text,["hoan","huy","an sang","bua sang"]):
            result.update(intent="ROOM_RECOMMEND",topic=None,action="NONE")
        else: result.update(intent="CLARIFY",topic=None,action="NONE")
    slots=dict(result.get("slots") or {})
    spatial={} if result["intent"]=="DIRECTIONS" else proximity_slots(message,result["intent"]=="RECOMMEND_HOTELS")
    if result["intent"]=="DIRECTIONS":
        origin=re.search(r"\b(?:tu|from)\s+(.+?)\s+(?:den|toi|to)\s+",text)
        predicted_origin=landmark_text(slots.get("origin") or "")
        slots.pop("origin",None)
        if origin: slots["origin"]=landmark_text(origin[1])[:160]
        elif predicted_origin and re.search(r"(?<!\w)"+re.escape(predicted_origin)+r"(?!\w)",text): slots["origin"]=predicted_origin[:160]
        result["action"]="NONE"
    else: slots.pop("origin",None)
    predicted=landmark_text(slots.get("landmark") or "")
    if spatial.get("landmark") and predicted and re.search(r"(?<!\w)"+re.escape(predicted)+r"(?!\w)",spatial["landmark"]):
        spatial["landmark"]=predicted
    pending_landmark=isinstance(conversation,dict) and conversation.get("pendingSlot")=="landmark"
    region_reply=city_reply(message) if pending_landmark else None
    if region_reply:
        spatial={}
        predicted=""
        slots["city"]=region_reply
        result.update(intent="RECOMMEND_HOTELS",topic=None,action="REFINE_SEARCH")
    if (not spatial and pending_landmark and predicted
            and result["intent"] in ("RECOMMEND_HOTELS","CLARIFY","HOTEL_DETAILS")
            and re.search(r"(?<!\w)"+re.escape(predicted)+r"(?!\w)",text)):
        # A bare name is a valid answer to the pending location question.
        # It must be present in this turn; never reuse a model-invented entity.
        spatial["landmark"]=predicted[:160]
    # Never carry a model-invented place/radius from earlier turns into CURRENT slots.
    for key in ("landmark","radiusKm","clearNearby"):
        slots.pop(key,None)
    slots.update(spatial)
    if spatial:
        result.update(intent="RECOMMEND_HOTELS",topic=None,action="NEW_SEARCH" if spatial.get("landmark") else "REFINE_SEARCH")
    search = result["intent"] in SEARCH or result["action"] in ("NEW_SEARCH","REFINE_SEARCH","MORE_HOTELS","MORE_ROOMS","MORE_OPTIONS","RECHECK_TRIP")
    explicit_edit = re.search(REMOVE,text) and (any(mentioned(text,aliases) for aliases in AMENITIES.values()) or mentioned(text,["ngan sach","gioi han tien","sao"]))
    if explicit_edit:
        search=True
        result.update(intent="CLARIFY",topic=None,action="REFINE_SEARCH")
    if search:
        # Exact entity mentions are evidence. An absent model slot never erases a previous constraint.
        cities=[]
        for city in CITIES:
            for match in re.finditer(r"(?<!\w)"+re.escape(norm(city))+r"(?!\w)",text):
                if not re.search(r"(?:khong (?:di|o)|bo)\s*$",text[max(0,match.start()-20):match.start()]):
                    cities.append((match.start(),city))
        aliases={alias:"Hồ Chí Minh" for alias in ("sai gon","saigon","hcm","tphcm","tp.hcm","tp hcm","ho chi minh city")}
        aliases.update({"hanoi":"Hà Nội","danang":"Đà Nẵng"})
        for alias,canonical_city in aliases.items():
            for match in re.finditer(r"(?<!\w)"+re.escape(alias)+r"(?!\w)",text):
                cities.append((match.start(),canonical_city))
        if cities: slots["city"]=max(cities)[1]
        elif slots.get("city") and norm(slots["city"]) not in text: slots.pop("city")
        if not cities and slots.get("city") and spatial.get("landmark") and norm(slots["city"]) in spatial["landmark"]:
            slots.pop("city") # A terminal/hospital name is not a province/city.
        if slots.get("city") and re.search(r"\b(?:doi|chuyen|change|switch)\b.*\b(?:sang|to)\b",text):
            result.update(intent="RECOMMEND_HOTELS",action="NEW_SEARCH")
        if not mentioned(text,["nguoi","nguoi lon","vo","chong","adults","adults","people"]): slots.pop("adults",None)
        if not mentioned(text,["tre em","tre","be","con","child","children","kids"]): slots.pop("children",None)
        parsed=money(text)
        if parsed is not None: slots["budget"]=parsed
        elif not re.search(r"\d.*(?:vnd|dong)|(?:ngan sach|budget)\s*\d",text): slots.pop("budget",None)
        if slots.get("budget") is not None:
            total_scope=mentioned(text,["tong ngan sach","tong tien","tong chi phi","ca chuyen","ca ky nghi","tron chuyen","toan bo chuyen","total budget"])
            nightly_scope=mentioned(text,["moi dem","mot dem","per night","gia dem"])
            if total_scope: slots["budgetScope"]="TOTAL"
            elif nightly_scope: slots["budgetScope"]="NIGHT"
        stars=re.search(r"\b([1-5]|mot|hai|ba|bon|nam)\s*(?:sao|stars?)\b",text)
        if stars: slots["starRating"]=int(stars[1]) if stars[1].isdigit() else DIGITS[stars[1]]
        elif not mentioned(text,["sao","star","stars"]): slots.pop("starRating",None)
        additions, removals=[],[]
        clauses=re.split(r"[,;.?!]|\bnhung\b",text)
        for name,aliases in AMENITIES.items():
            for clause in clauses:
                if not mentioned(clause,aliases): continue
                (removals if removal(clause,aliases) else additions).append(name)
        if additions: slots["amenitiesAdd"]=list(dict.fromkeys(additions))
        else: slots.pop("amenitiesAdd",None)
        if removals: slots["amenitiesRemove"]=list(dict.fromkeys(removals))
        else: slots.pop("amenitiesRemove",None)
        for key,aliases in (("refundableOnly",["hoan tien","hoan khi huy","duoc hoan","cho phep hoan","lay lai tien","tra lai tien","refund","refundable"]),("breakfastOnly",AMENITIES["Bữa sáng"])):
            clauses_with_feature=[clause for clause in clauses if mentioned(clause,aliases)]
            if clauses_with_feature: slots[key]=not any(removal(clause,aliases) for clause in clauses_with_feature)
            else: slots.pop(key,None)
        for key,aliases in (("clearBudget",["ngan sach","gioi han tien","tran ngan sach","muc gia","gioi han gia"]),("clearStars",["sao","hang sao","so sao"])):
            if any(mentioned(clause,aliases) and removal(clause,aliases) for clause in clauses): slots[key]=True
            else: slots.pop(key,None)
        # These predicates need data/business filters the current API does not expose.
        unsupported=[]
        for pattern,label in [
            (r"\bcach\b.*\bphut\b","thời gian di chuyển thực tế"),
            (r"\b(?:nhin|huong|view)\b.*\b(?:bien|nui|song|vuon)\b","hướng nhìn của phòng"),
            (r"\bgiuong\s+(?:tron|doi|don|king|queen|twin|tang)\b","lọc theo loại giường"),
        ]:
            if re.search(pattern,text): unsupported.append(label)
        if unsupported: slots["unsupportedConstraints"]=unsupported
        elif slots.get("unsupportedConstraints"):
            slots["unsupportedConstraints"]=[item for item in slots["unsupportedConstraints"] if not any(mentioned(norm(item),aliases) for aliases in AMENITIES.values())]
        if slots.get("amenitiesRemove") or slots.get("clearBudget") or slots.get("clearStars"): result["action"]="REFINE_SEARCH"
    # Business symbols and writing/reading are explicit disambiguating evidence.
    topic=None
    for candidate,aliases in [
        ("QR",["qr","ma nhan phong"]),
        ("WALLET",["vi enziu","vi dien tu","giao dich vi"]),
        ("PROMOTION",["voucher","ma giam gia","ma uu dai"]),
        ("ENGINE",["gemini","mo hinh ai","google ai","mo hinh ben ngoai"]),
        ("DEPOSIT",["tien coc","dat coc"]),
    ]:
        if mentioned(text,aliases): topic=candidate; break
    writing = re.search(r"\b(?:viet|gui|dang|ke lai)\b",text) and mentioned(text,["nhan xet","trai nghiem","danh gia","review"])
    if writing and not mentioned(text,["khach truoc","nguoi khac"]): topic="WRITE_REVIEW"
    if topic and result["intent"] not in SEARCH and result["intent"]!="MY_BOOKINGS":
        result.update(intent="GENERAL",topic=topic,action="NONE")
    if mentioned(text,["nguoi khac","tai khoan khac"]) and result["intent"]=="MY_BOOKINGS":
        result.update(intent="CLARIFY",topic=None,action="NONE")
    result["slots"]=slots
    # Outside-scope answers also abstain and ask for an EnziuRooms task.
    result["behavior"]="CLARIFY" if result["intent"] in ("CLARIFY","OUT_OF_SCOPE") else "ANSWER"
    return result
