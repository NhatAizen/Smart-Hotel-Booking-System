from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from fastapi import Header, HTTPException, status

from .config import settings


def require_internal_key(x_internal_api_key: str | None = Header(default=None)) -> None:
    expected = settings.internal_api_key.encode("utf-8")
    supplied = (x_internal_api_key or "").encode("utf-8")
    if not expected or not hmac.compare_digest(expected, supplied):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API key",
        )


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def sign_payload(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    body_part = _b64_encode(body)
    signature = hmac.new(
        settings.token_secret.encode("utf-8"),
        body_part.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{body_part}.{_b64_encode(signature)}"


def verify_signed_payload(token: str, expected_type: str) -> dict[str, Any]:
    try:
        body_part, sig_part = token.split(".", 1)
        expected_sig = hmac.new(
            settings.token_secret.encode("utf-8"),
            body_part.encode("ascii"),
            hashlib.sha256,
        ).digest()
        supplied_sig = _b64_decode(sig_part)
        if not hmac.compare_digest(expected_sig, supplied_sig):
            raise ValueError("signature mismatch")
        payload = json.loads(_b64_decode(body_part))
    except Exception as exc:
        raise HTTPException(status_code=422, detail="eKYC challenge token không hợp lệ") from exc

    now = int(time.time())
    if payload.get("typ") != expected_type:
        raise HTTPException(status_code=422, detail="Sai loại eKYC token")
    if int(payload.get("exp", 0)) < now:
        raise HTTPException(status_code=422, detail="eKYC challenge đã hết hạn, vui lòng thực hiện lại")
    return payload


def new_nonce() -> str:
    return secrets.token_urlsafe(18)
