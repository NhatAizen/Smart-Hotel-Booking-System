from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class ChallengeRequest(BaseModel):
    userId: str = Field(min_length=8, max_length=80)


class ChallengeResponse(BaseModel):
    challengeId: str
    challengeToken: str
    challenges: list[str]
    expiresAt: datetime


class VerificationJsonRequest(BaseModel):
    """
    Stable service-to-service transport used by Identity Service.

    Browser uploads remain multipart to Spring Boot. Only the internal hop from
    Identity -> eKYC uses JSON/Base64 so reverse proxies and multipart parsers
    cannot drop boundaries/parts.
    """

    userId: str = Field(min_length=8, max_length=80)
    challengeToken: str = Field(min_length=16, max_length=8192)
    cccdFrontBase64: str = Field(min_length=4)
    frame0Base64: str = Field(min_length=4)
    frame1Base64: str = Field(min_length=4)
    frame2Base64: str = Field(min_length=4)


class VerificationChecks(BaseModel):
    singleFaceOnId: bool
    singleFaceOnAllLiveFrames: bool
    imageQualityPassed: bool
    idImageQualityPassed: bool
    liveImageQualityPassed: bool
    allFrontPosePassed: bool
    liveFramesDifferent: bool
    samePersonAcrossLiveFrames: bool
    idFaceMatched: bool


class VerificationResponse(BaseModel):
    verified: bool
    livenessVerified: bool
    faceVerified: bool
    faceSimilarity: float
    faceMatchThreshold: float
    challengeId: str
    processedAt: datetime
    checks: VerificationChecks
