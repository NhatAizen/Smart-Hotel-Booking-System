# EnziuRooms eKYC Service

Internal, CPU-friendly FastAPI microservice used only by `identity-service`.

## Front-only liveness mode

The customer **does not need to turn left or right**. The browser opens the live camera, waits for the customer to place their face in the oval, then captures three frontal frames at different moments.

The service checks:

1. Server-issued short-lived challenge token.
2. Exactly one face on the CCCD front and each camera frame.
3. CCCD portrait and live-camera image quality separately.
4. All three camera frames remain reasonably frontal.
5. The three frames are not an exact reused still frame; small natural temporal variation is required.
6. The same person appears in all three live frames.
7. SFace cosine similarity between the CCCD portrait and the sharpest frontal live frame.

It never stores uploaded camera frames, video, or face embeddings. `identity-service` owns private CCCD storage and persists only verification results.

## Important

This is a **project-grade, front-only liveness layer** optimized for usability. It is easier for customers than left/right head-turn challenges, but it is not equivalent to a bank-certified PAD/eKYC product. Sophisticated replay/deepfake attacks require dedicated anti-spoofing/PAD technology or a certified provider.
