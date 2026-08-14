from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .config import settings


class EkycImageError(ValueError):
    pass


@dataclass
class FaceObservation:
    image: np.ndarray
    face_row: np.ndarray
    feature: np.ndarray
    score: float
    area_ratio: float
    brightness: float
    blur_variance: float
    yaw_signal: float


class OpenCvFaceEngine:
    """
    CPU-only face pipeline based on OpenCV YuNet + SFace.
    No image or embedding is persisted by this service.
    """

    def __init__(self) -> None:
        detector_path = Path(settings.yunet_model_path)
        recognizer_path = Path(settings.sface_model_path)
        if not detector_path.is_file():
            raise RuntimeError(f"YuNet model not found: {detector_path}")
        if not recognizer_path.is_file():
            raise RuntimeError(f"SFace model not found: {recognizer_path}")

        self.detector = cv2.FaceDetectorYN_create(
            str(detector_path),
            "",
            (320, 320),
            settings.detector_score_threshold,
            0.3,
            5000,
        )
        self.recognizer = cv2.FaceRecognizerSF_create(str(recognizer_path), "")

    @staticmethod
    def decode_image(raw: bytes) -> np.ndarray:
        if not raw:
            raise EkycImageError("Ảnh eKYC bị rỗng")
        arr = np.frombuffer(raw, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None or image.size == 0:
            raise EkycImageError("Không đọc được ảnh eKYC")
        if image.shape[0] < 240 or image.shape[1] < 240:
            raise EkycImageError("Ảnh eKYC quá nhỏ, cần tối thiểu 240x240")
        return image

    def observe(self, raw: bytes, *, min_face_area_ratio: float) -> FaceObservation:
        image = self.decode_image(raw)
        height, width = image.shape[:2]
        self.detector.setInputSize((width, height))
        _, faces = self.detector.detect(image)
        if faces is None or len(faces) == 0:
            raise EkycImageError("Không phát hiện được khuôn mặt")

        valid = [face for face in faces if float(face[14]) >= settings.detector_score_threshold]
        if len(valid) != 1:
            if len(valid) > 1:
                raise EkycImageError("Phải có đúng một khuôn mặt trong ảnh")
            raise EkycImageError("Khuôn mặt không đủ rõ để xác minh")

        face = np.asarray(valid[0], dtype=np.float32)
        x, y, w, h = [float(v) for v in face[:4]]
        area_ratio = max(0.0, w * h) / float(width * height)
        if area_ratio < min_face_area_ratio:
            raise EkycImageError("Khuôn mặt quá nhỏ trong khung hình")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))
        blur_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        right_eye = np.array([face[4], face[5]], dtype=np.float32)
        left_eye = np.array([face[6], face[7]], dtype=np.float32)
        nose = np.array([face[8], face[9]], dtype=np.float32)
        eye_mid = (right_eye + left_eye) / 2.0
        eye_distance = max(float(np.linalg.norm(left_eye - right_eye)), 1.0)
        yaw_signal = float((nose[0] - eye_mid[0]) / eye_distance)

        aligned = self.recognizer.alignCrop(image, face[:14])
        feature = self.recognizer.feature(aligned).copy()

        return FaceObservation(
            image=image,
            face_row=face,
            feature=feature,
            score=float(face[14]),
            area_ratio=area_ratio,
            brightness=brightness,
            blur_variance=blur_variance,
            yaw_signal=yaw_signal,
        )

    def cosine_similarity(self, a: FaceObservation, b: FaceObservation) -> float:
        return float(
            self.recognizer.match(
                a.feature,
                b.feature,
                cv2.FaceRecognizerSF_FR_COSINE,
            )
        )

    @staticmethod
    def frame_difference(a: FaceObservation, b: FaceObservation) -> float:
        ga = cv2.cvtColor(a.image, cv2.COLOR_BGR2GRAY)
        gb = cv2.cvtColor(b.image, cv2.COLOR_BGR2GRAY)
        ga = cv2.resize(ga, (64, 64), interpolation=cv2.INTER_AREA)
        gb = cv2.resize(gb, (64, 64), interpolation=cv2.INTER_AREA)
        return float(np.mean(cv2.absdiff(ga, gb)))
