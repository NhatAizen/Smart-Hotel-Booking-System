from __future__ import annotations

from functools import lru_cache
import base64
import binascii
import logging
import re
from time import perf_counter
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

from .config import settings
from .schemas import ChallengeRequest, ChallengeResponse, VerificationJsonRequest, VerificationResponse
from .security import require_internal_key
from .service import EkycService

LOGGER = logging.getLogger("enziu.ekyc")
CORRELATION_HEADER = "X-Correlation-ID"
SAFE_CORRELATION_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
REQUESTS = Counter(
    "enziu_ekyc_http_requests_total",
    "Total eKYC HTTP requests",
    ("method", "status"),
)
REQUEST_DURATION = Histogram(
    "enziu_ekyc_http_request_duration_seconds",
    "eKYC HTTP request duration",
    ("method",),
)

app = FastAPI(
    title="EnziuRooms eKYC Service",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# Browser never calls this service directly; keep CORS effectively closed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=False,
    allow_methods=[],
    allow_headers=[],
)


@app.middleware("http")
async def correlation_and_metrics(request: Request, call_next):
    incoming = request.headers.get(CORRELATION_HEADER, "")
    correlation_id = incoming if SAFE_CORRELATION_ID.fullmatch(incoming) else str(uuid4())
    started = perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers[CORRELATION_HEADER] = correlation_id
        return response
    finally:
        elapsed = perf_counter() - started
        REQUESTS.labels(request.method, str(status)).inc()
        REQUEST_DURATION.labels(request.method).observe(elapsed)
        LOGGER.info(
            "service=ekyc-service correlationId=%s method=%s path=%s status=%s durationMs=%.1f",
            correlation_id,
            request.method,
            request.url.path,
            status,
            elapsed * 1000,
        )


@lru_cache(maxsize=1)
def get_service() -> EkycService:
    return EkycService()




def _decode_base64_image(value: str, label: str) -> bytes:
    try:
        raw = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"{label} không phải Base64 hợp lệ") from exc

    if not raw:
        raise HTTPException(status_code=422, detail=f"{label} bị rỗng")
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail=f"{label} vượt quá giới hạn dung lượng")
    return raw

async def _read_limited(file: UploadFile) -> bytes:
    raw = await file.read(settings.max_upload_bytes + 1)
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail=f"{file.filename or 'Ảnh'} vượt quá giới hạn dung lượng")
    if not (file.content_type or "").lower().startswith("image/"):
        raise HTTPException(status_code=415, detail="eKYC chỉ chấp nhận dữ liệu ảnh")
    return raw


@app.get("/health")
def health() -> dict:
    # Instantiating the service proves that both ONNX models can be opened.
    get_service()
    return {"status": "UP", "engine": "OpenCV YuNet + SFace", "storage": "stateless"}


@app.get("/metrics", include_in_schema=False)
def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post(
    "/internal/v1/challenges/{user_id}",
    response_model=ChallengeResponse,
    dependencies=[Depends(require_internal_key)],
)
def create_challenge_for_user(user_id: str) -> dict:
    # Path-based contract avoids request-body validation failures between
    # Spring RestClient and FastAPI while still binding the challenge to user.
    if not (8 <= len(user_id) <= 80):
        raise HTTPException(status_code=422, detail="User ID eKYC không hợp lệ")
    return get_service().create_challenge(user_id)


# Backward-compatible endpoint for older clients/tests.
@app.post(
    "/internal/v1/challenges",
    response_model=ChallengeResponse,
    dependencies=[Depends(require_internal_key)],
)
def create_challenge(payload: ChallengeRequest) -> dict:
    return get_service().create_challenge(payload.userId)


@app.post(
    "/internal/v1/verify-json",
    response_model=VerificationResponse,
    dependencies=[Depends(require_internal_key)],
)
def verify_json(payload: VerificationJsonRequest) -> VerificationResponse:
    return get_service().verify(
        user_id=payload.userId,
        challenge_token=payload.challengeToken,
        cccd_front=_decode_base64_image(payload.cccdFrontBase64, "Ảnh CCCD mặt trước"),
        frames=[
            _decode_base64_image(payload.frame0Base64, "Ảnh liveness bước 1"),
            _decode_base64_image(payload.frame1Base64, "Ảnh liveness bước 2"),
            _decode_base64_image(payload.frame2Base64, "Ảnh liveness bước 3"),
        ],
    )


# Backward-compatible multipart endpoint. Identity Service uses /verify-json.
@app.post(
    "/internal/v1/verify",
    response_model=VerificationResponse,
    dependencies=[Depends(require_internal_key)],
)
async def verify(
    userId: str = Form(...),
    challengeToken: str = Form(...),
    cccdFront: UploadFile = File(...),
    frame0: UploadFile = File(...),
    frame1: UploadFile = File(...),
    frame2: UploadFile = File(...),
) -> VerificationResponse:
    files = [cccdFront, frame0, frame1, frame2]
    payloads = [await _read_limited(file) for file in files]
    return get_service().verify(
        user_id=userId,
        challenge_token=challengeToken,
        cccd_front=payloads[0],
        frames=payloads[1:],
    )
