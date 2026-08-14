from __future__ import annotations

from datetime import datetime, timezone
import time
import uuid
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException

from .config import settings
from .face_engine import EkycImageError, FaceObservation, OpenCvFaceEngine
from .schemas import VerificationChecks, VerificationResponse
from .security import new_nonce, sign_payload, verify_signed_payload


FRONT_ONLY_CHALLENGES = ["FRONT_1", "FRONT_2", "FRONT_3"]


class EkycService:
    def __init__(self, engine: OpenCvFaceEngine | None = None) -> None:
        self.engine = engine or OpenCvFaceEngine()
        self._challenge_attempts: dict[str, deque[float]] = defaultdict(deque)
        self._rate_lock = Lock()

    def _enforce_challenge_rate_limit(self, user_id: str) -> None:
        now = time.time()
        window_start = now - settings.challenge_rate_limit_window_seconds
        with self._rate_lock:
            attempts = self._challenge_attempts[user_id]
            while attempts and attempts[0] < window_start:
                attempts.popleft()
            if len(attempts) >= settings.challenge_rate_limit_count:
                raise HTTPException(
                    status_code=429,
                    detail="Bạn đã thử eKYC quá nhiều lần. Vui lòng chờ vài phút rồi thử lại.",
                )
            attempts.append(now)

    def create_challenge(self, user_id: str) -> dict:
        self._enforce_challenge_rate_limit(user_id)
        now = int(time.time())
        challenge_id = uuid.uuid4().hex
        expires = now + settings.challenge_ttl_seconds
        payload = {
            "typ": "challenge",
            "sub": user_id,
            "cid": challenge_id,
            "nonce": new_nonce(),
            "ch": FRONT_ONLY_CHALLENGES,
            "iat": now,
            "exp": expires,
        }
        return {
            "challengeId": challenge_id,
            "challengeToken": sign_payload(payload),
            "challenges": FRONT_ONLY_CHALLENGES,
            "expiresAt": datetime.fromtimestamp(expires, tz=timezone.utc),
        }

    @staticmethod
    def _quality_ok(obs: FaceObservation, *, live: bool) -> bool:
        if not (settings.min_brightness <= obs.brightness <= settings.max_brightness):
            return False
        blur_threshold = (
            settings.live_min_blur_variance if live else settings.id_min_blur_variance
        )
        if obs.blur_variance < blur_threshold:
            return False
        if live and not (
            settings.live_min_face_area_ratio
            <= obs.area_ratio
            <= settings.live_max_face_area_ratio
        ):
            return False
        return True

    def verify(
        self,
        *,
        user_id: str,
        challenge_token: str,
        cccd_front: bytes,
        frames: list[bytes],
    ) -> VerificationResponse:
        payload = verify_signed_payload(challenge_token, "challenge")
        if str(payload.get("sub")) != user_id:
            raise HTTPException(status_code=422, detail="eKYC challenge không thuộc tài khoản hiện tại")

        challenges = payload.get("ch")
        if challenges != FRONT_ONLY_CHALLENGES:
            raise HTTPException(status_code=422, detail="Cấu trúc eKYC chính diện không hợp lệ")
        if len(frames) != 3:
            raise HTTPException(status_code=422, detail="Cần đủ 3 ảnh khuôn mặt chính diện")

        try:
            id_obs = self.engine.observe(
                cccd_front,
                min_face_area_ratio=settings.id_min_face_area_ratio,
            )
            live_obs = [
                self.engine.observe(raw, min_face_area_ratio=settings.live_min_face_area_ratio)
                for raw in frames
            ]
        except EkycImageError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        id_quality_ok = self._quality_ok(id_obs, live=False)
        live_quality_ok = all(self._quality_ok(obs, live=True) for obs in live_obs)
        quality_ok = id_quality_ok and live_quality_ok

        # Front-only mode: every captured frame must remain reasonably frontal.
        all_front_pose_ok = all(
            abs(obs.yaw_signal) <= settings.center_yaw_abs_max for obs in live_obs
        )

        differences = [
            self.engine.frame_difference(live_obs[0], live_obs[1]),
            self.engine.frame_difference(live_obs[1], live_obs[2]),
            self.engine.frame_difference(live_obs[0], live_obs[2]),
        ]
        # We still require small natural changes across moments to reject an exact reused frame,
        # but the threshold is intentionally lower than the old left/right-turn challenge.
        frames_different = min(differences) >= settings.front_min_frame_difference

        live_scores = [
            self.engine.cosine_similarity(live_obs[0], live_obs[1]),
            self.engine.cosine_similarity(live_obs[0], live_obs[2]),
            self.engine.cosine_similarity(live_obs[1], live_obs[2]),
        ]
        same_person_live = min(live_scores) >= settings.live_consistency_threshold

        # Use the sharpest of the three frontal frames for CCCD face matching.
        best_live = max(live_obs, key=lambda obs: obs.blur_variance)
        face_similarity = self.engine.cosine_similarity(id_obs, best_live)
        id_face_matched = face_similarity >= settings.face_match_threshold

        liveness_verified = bool(
            quality_ok
            and all_front_pose_ok
            and frames_different
            and same_person_live
        )
        face_verified = bool(id_face_matched)
        verified = bool(liveness_verified and face_verified)

        checks = VerificationChecks(
            singleFaceOnId=True,
            singleFaceOnAllLiveFrames=True,
            imageQualityPassed=quality_ok,
            idImageQualityPassed=id_quality_ok,
            liveImageQualityPassed=live_quality_ok,
            allFrontPosePassed=all_front_pose_ok,
            liveFramesDifferent=frames_different,
            samePersonAcrossLiveFrames=same_person_live,
            idFaceMatched=id_face_matched,
        )

        return VerificationResponse(
            verified=verified,
            livenessVerified=liveness_verified,
            faceVerified=face_verified,
            faceSimilarity=round(face_similarity, 5),
            faceMatchThreshold=settings.face_match_threshold,
            challengeId=str(payload.get("cid")),
            processedAt=datetime.now(timezone.utc),
            checks=checks,
        )
