from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app import main as main_module
from app.config import settings
from app.schemas import VerificationChecks, VerificationResponse


class StubService:
    def create_challenge(self, user_id: str):
        return {
            "challengeId": "cid-1",
            "challengeToken": "signed-token",
            "challenges": ["FRONT_1", "FRONT_2", "FRONT_3"],
            "expiresAt": datetime.now(timezone.utc),
        }

    def verify(self, *, user_id, challenge_token, cccd_front, frames):
        assert user_id in {"user-1", "user-0001"}
        assert challenge_token in {"signed-token", "signed-token-12345"}
        assert cccd_front == b"front"
        assert frames == [b"f0", b"f1", b"f2"]
        return VerificationResponse(
            verified=True,
            livenessVerified=True,
            faceVerified=True,
            faceSimilarity=0.75,
            faceMatchThreshold=0.42,
            challengeId="cid-1",
            processedAt=datetime.now(timezone.utc),
            checks=VerificationChecks(
                singleFaceOnId=True,
                singleFaceOnAllLiveFrames=True,
                imageQualityPassed=True,
                idImageQualityPassed=True,
                liveImageQualityPassed=True,
                allFrontPosePassed=True,
                liveFramesDifferent=True,
                samePersonAcrossLiveFrames=True,
                idFaceMatched=True,
            ),
        )


def client(monkeypatch):
    monkeypatch.setattr(main_module, "get_service", lambda: StubService())
    return TestClient(main_module.app)


def test_internal_endpoint_rejects_missing_key(monkeypatch):
    response = client(monkeypatch).post(
        "/internal/v1/challenges",
        json={"userId": "user-123"},
    )
    assert response.status_code == 401


def test_create_challenge_requires_internal_key(monkeypatch):
    response = client(monkeypatch).post(
        "/internal/v1/challenges",
        headers={"X-Internal-Api-Key": settings.internal_api_key},
        json={"userId": "user-123"},
    )
    assert response.status_code == 200
    assert response.json()["challenges"] == ["FRONT_1", "FRONT_2", "FRONT_3"]


def test_create_challenge_path_contract_requires_internal_key(monkeypatch):
    response = client(monkeypatch).post(
        "/internal/v1/challenges/user-123",
        headers={"X-Internal-Api-Key": settings.internal_api_key},
    )
    assert response.status_code == 200
    assert response.json()["challengeToken"] == "signed-token"


def test_create_challenge_path_rejects_short_user_id(monkeypatch):
    response = client(monkeypatch).post(
        "/internal/v1/challenges/abc",
        headers={"X-Internal-Api-Key": settings.internal_api_key},
    )
    assert response.status_code == 422


def test_verify_multipart_contract(monkeypatch):
    response = client(monkeypatch).post(
        "/internal/v1/verify",
        headers={"X-Internal-Api-Key": settings.internal_api_key},
        data={"userId": "user-1", "challengeToken": "signed-token"},
        files={
            "cccdFront": ("front.jpg", b"front", "image/jpeg"),
            "frame0": ("0.jpg", b"f0", "image/jpeg"),
            "frame1": ("1.jpg", b"f1", "image/jpeg"),
            "frame2": ("2.jpg", b"f2", "image/jpeg"),
        },
    )
    assert response.status_code == 200
    assert response.json()["verified"] is True


def test_verify_rejects_non_image_upload(monkeypatch):
    response = client(monkeypatch).post(
        "/internal/v1/verify",
        headers={"X-Internal-Api-Key": settings.internal_api_key},
        data={"userId": "user-1", "challengeToken": "signed-token"},
        files={
            "cccdFront": ("front.txt", b"front", "text/plain"),
            "frame0": ("0.jpg", b"f0", "image/jpeg"),
            "frame1": ("1.jpg", b"f1", "image/jpeg"),
            "frame2": ("2.jpg", b"f2", "image/jpeg"),
        },
    )
    assert response.status_code == 415


def test_verify_json_contract(monkeypatch):
    import base64

    response = client(monkeypatch).post(
        "/internal/v1/verify-json",
        headers={"X-Internal-Api-Key": settings.internal_api_key},
        json={
            "userId": "user-0001",
            "challengeToken": "signed-token-12345",
            "cccdFrontBase64": base64.b64encode(b"front").decode(),
            "frame0Base64": base64.b64encode(b"f0").decode(),
            "frame1Base64": base64.b64encode(b"f1").decode(),
            "frame2Base64": base64.b64encode(b"f2").decode(),
        },
    )
    assert response.status_code == 200
    assert response.json()["verified"] is True
    assert response.json()["checks"]["allFrontPosePassed"] is True


def test_verify_json_rejects_invalid_base64(monkeypatch):
    response = client(monkeypatch).post(
        "/internal/v1/verify-json",
        headers={"X-Internal-Api-Key": settings.internal_api_key},
        json={
            "userId": "user-0001",
            "challengeToken": "signed-token-12345",
            "cccdFrontBase64": "%%%not-base64%%%",
            "frame0Base64": "ZmFrZS1mcmFtZS0w",
            "frame1Base64": "ZmFrZS1mcmFtZS0x",
            "frame2Base64": "ZmFrZS1mcmFtZS0y",
        },
    )
    assert response.status_code == 422
    assert "Base64" in response.json()["detail"]
