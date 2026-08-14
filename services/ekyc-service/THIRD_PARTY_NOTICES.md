# Third-party models

This service uses models from **OpenCV Zoo** and runs them locally; no commercial eKYC API is called.

- YuNet face detector: `face_detection_yunet_2023mar.onnx` — MIT license in the OpenCV Zoo model directory.
- SFace face recognizer: `face_recognition_sface_2021dec.onnx` — Apache License 2.0 in the OpenCV Zoo model directory.
- OpenCV itself is distributed under its own open-source license.

The Dockerfile downloads exact model files and verifies their SHA-256 checksums so builds are reproducible and a substituted model is rejected.
