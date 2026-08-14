from __future__ import annotations

import time

import numpy as np
import pytest
from fastapi import HTTPException

from app.face_engine import FaceObservation
from app.security import sign_payload, verify_signed_payload
from app.service import EkycService, FRONT_ONLY_CHALLENGES


def obs(code: int, yaw: float, *, brightness=120.0, blur=100.0, area=0.2):
    return FaceObservation(
        image=np.full((64, 64, 3), code, dtype=np.uint8),
        face_row=np.zeros(15, dtype=np.float32),
        feature=np.array([[float(code)]], dtype=np.float32),
        score=0.99,
        area_ratio=area,
        brightness=brightness,
        blur_variance=blur,
        yaw_signal=yaw,
    )


class FakeEngine:
    def __init__(self, *, face_score=0.75, live_score=0.80, frame_diff=3.0):
        self.face_score = face_score
        self.live_score = live_score
        self.frame_diff = frame_diff
        self.mapping = {
            b"id": obs(10, 0.0, area=0.05),
            b"front-1": obs(20, 0.02, blur=90.0),
            b"front-2": obs(30, -0.03, blur=110.0),
            b"front-3": obs(40, 0.01, blur=100.0),
        }

    def observe(self, raw: bytes, *, min_face_area_ratio: float):
        return self.mapping[raw]

    def cosine_similarity(self, a: FaceObservation, b: FaceObservation) -> float:
        codes = {int(a.feature[0, 0]), int(b.feature[0, 0])}
        if 10 in codes and len(codes) == 2:
            return self.face_score
        return self.live_score

    def frame_difference(self, a: FaceObservation, b: FaceObservation) -> float:
        return self.frame_diff


def challenge(service: EkycService, user="user-1"):
    return service.create_challenge(user)


def test_challenge_is_signed_bound_to_user_and_front_only():
    service = EkycService(engine=FakeEngine())
    created = challenge(service, "abc-user")
    payload = verify_signed_payload(created["challengeToken"], "challenge")
    assert payload["sub"] == "abc-user"
    assert payload["ch"] == FRONT_ONLY_CHALLENGES
    assert created["challenges"] == FRONT_ONLY_CHALLENGES
    assert payload["exp"] > payload["iat"]


def test_tampered_challenge_is_rejected():
    service = EkycService(engine=FakeEngine())
    token = challenge(service)["challengeToken"]
    tampered = ("A" if token[0] != "A" else "B") + token[1:]
    with pytest.raises(HTTPException) as error:
        verify_signed_payload(tampered, "challenge")
    assert error.value.status_code == 422


def test_expired_challenge_is_rejected():
    token = sign_payload({"typ": "challenge", "sub": "u", "exp": int(time.time()) - 1})
    with pytest.raises(HTTPException) as error:
        verify_signed_payload(token, "challenge")
    assert "hết hạn" in str(error.value.detail)


def test_successful_front_only_verification_requires_quality_motion_and_face_match():
    service = EkycService(engine=FakeEngine())
    created = challenge(service)
    result = service.verify(
        user_id="user-1",
        challenge_token=created["challengeToken"],
        cccd_front=b"id",
        frames=[b"front-1", b"front-2", b"front-3"],
    )
    assert result.verified is True
    assert result.livenessVerified is True
    assert result.faceVerified is True
    assert result.faceSimilarity == 0.75
    assert result.checks.allFrontPosePassed is True
    assert result.checks.liveFramesDifferent is True
    assert result.checks.samePersonAcrossLiveFrames is True


def test_face_mismatch_blocks_verification_even_if_front_liveness_passes():
    service = EkycService(engine=FakeEngine(face_score=0.20))
    created = challenge(service)
    result = service.verify(
        user_id="user-1",
        challenge_token=created["challengeToken"],
        cccd_front=b"id",
        frames=[b"front-1", b"front-2", b"front-3"],
    )
    assert result.livenessVerified is True
    assert result.faceVerified is False
    assert result.verified is False


def test_exact_reused_frames_fail_front_liveness():
    service = EkycService(engine=FakeEngine(frame_diff=0.0))
    created = challenge(service)
    result = service.verify(
        user_id="user-1",
        challenge_token=created["challengeToken"],
        cccd_front=b"id",
        frames=[b"front-1", b"front-2", b"front-3"],
    )
    assert result.checks.liveFramesDifferent is False
    assert result.livenessVerified is False
    assert result.verified is False


def test_different_person_between_front_frames_fails_liveness():
    service = EkycService(engine=FakeEngine(live_score=0.10))
    created = challenge(service)
    result = service.verify(
        user_id="user-1",
        challenge_token=created["challengeToken"],
        cccd_front=b"id",
        frames=[b"front-1", b"front-2", b"front-3"],
    )
    assert result.checks.samePersonAcrossLiveFrames is False
    assert result.livenessVerified is False


def test_challenge_cannot_be_used_by_another_user():
    service = EkycService(engine=FakeEngine())
    created = challenge(service, "owner-user")
    with pytest.raises(HTTPException) as error:
        service.verify(
            user_id="attacker-user",
            challenge_token=created["challengeToken"],
            cccd_front=b"id",
            frames=[b"front-1", b"front-2", b"front-3"],
        )
    assert error.value.status_code == 422
    assert "không thuộc" in str(error.value.detail)


def test_side_pose_in_any_front_frame_fails_liveness():
    engine = FakeEngine()
    engine.mapping[b"front-2"] = obs(30, 0.75)
    service = EkycService(engine=engine)
    created = challenge(service)
    result = service.verify(
        user_id="user-1",
        challenge_token=created["challengeToken"],
        cccd_front=b"id",
        frames=[b"front-1", b"front-2", b"front-3"],
    )
    assert result.checks.allFrontPosePassed is False
    assert result.livenessVerified is False


def test_poor_image_quality_fails_front_liveness():
    engine = FakeEngine()
    engine.mapping[b"front-1"] = obs(20, 0.0, blur=2.0)
    service = EkycService(engine=engine)
    created = challenge(service)
    result = service.verify(
        user_id="user-1",
        challenge_token=created["challengeToken"],
        cccd_front=b"id",
        frames=[b"front-1", b"front-2", b"front-3"],
    )
    assert result.checks.imageQualityPassed is False
    assert result.livenessVerified is False


def test_old_turn_challenge_is_rejected():
    token = sign_payload(
        {
            "typ": "challenge",
            "sub": "user-1",
            "cid": "old",
            "ch": ["CENTER", "TURN_LEFT", "TURN_RIGHT"],
            "exp": int(time.time()) + 60,
        }
    )
    service = EkycService(engine=FakeEngine())
    with pytest.raises(HTTPException) as error:
        service.verify(
            user_id="user-1",
            challenge_token=token,
            cccd_front=b"id",
            frames=[b"front-1", b"front-2", b"front-3"],
        )
    assert error.value.status_code == 422
    assert "chính diện" in str(error.value.detail)


def test_challenge_rate_limit_blocks_excessive_attempts():
    service = EkycService(engine=FakeEngine())
    for _ in range(5):
        service.create_challenge("rate-user")
    with pytest.raises(HTTPException) as error:
        service.create_challenge("rate-user")
    assert error.value.status_code == 429
