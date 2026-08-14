from __future__ import annotations

from dataclasses import dataclass
import os


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    internal_api_key: str = os.getenv("EKYC_INTERNAL_API_KEY", "change-me-in-production")
    token_secret: str = os.getenv("EKYC_TOKEN_SECRET", "change-me-in-production-too")
    challenge_ttl_seconds: int = _int("EKYC_CHALLENGE_TTL_SECONDS", 300)
    challenge_rate_limit_count: int = _int("EKYC_CHALLENGE_RATE_LIMIT_COUNT", 5)
    challenge_rate_limit_window_seconds: int = _int("EKYC_CHALLENGE_RATE_LIMIT_WINDOW_SECONDS", 600)
    max_upload_bytes: int = _int("EKYC_MAX_UPLOAD_BYTES", 8 * 1024 * 1024)

    yunet_model_path: str = os.getenv(
        "EKYC_YUNET_MODEL_PATH", "/app/models/face_detection_yunet_2023mar.onnx"
    )
    sface_model_path: str = os.getenv(
        "EKYC_SFACE_MODEL_PATH", "/app/models/face_recognition_sface_2021dec.onnx"
    )

    detector_score_threshold: float = _float("EKYC_FACE_DETECT_SCORE", 0.86)
    face_match_threshold: float = _float("EKYC_FACE_MATCH_THRESHOLD", 0.42)
    live_consistency_threshold: float = _float("EKYC_LIVE_CONSISTENCY_THRESHOLD", 0.34)
    live_min_face_area_ratio: float = _float("EKYC_LIVE_MIN_FACE_AREA_RATIO", 0.08)
    live_max_face_area_ratio: float = _float("EKYC_LIVE_MAX_FACE_AREA_RATIO", 0.72)
    id_min_face_area_ratio: float = _float("EKYC_ID_MIN_FACE_AREA_RATIO", 0.015)
    min_brightness: float = _float("EKYC_MIN_BRIGHTNESS", 40.0)
    max_brightness: float = _float("EKYC_MAX_BRIGHTNESS", 225.0)
    # Separate blur thresholds are more practical for printed CCCD portraits and webcams.
    id_min_blur_variance: float = _float("EKYC_ID_MIN_BLUR_VARIANCE", 20.0)
    live_min_blur_variance: float = _float("EKYC_LIVE_MIN_BLUR_VARIANCE", 20.0)
    center_yaw_abs_max: float = _float("EKYC_CENTER_YAW_ABS_MAX", 0.38)
    # Front-only liveness: user never needs to turn left/right.
    front_min_frame_difference: float = _float("EKYC_FRONT_MIN_FRAME_DIFFERENCE", 0.65)


settings = Settings()
