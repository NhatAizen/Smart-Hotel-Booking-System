import cv2
import numpy as np
import pytest

from app.face_engine import EkycImageError, OpenCvFaceEngine


def jpeg_bytes(width=320, height=320, value=127):
    image = np.full((height, width, 3), value, dtype=np.uint8)
    ok, encoded = cv2.imencode('.jpg', image)
    assert ok
    return encoded.tobytes()


def test_decode_valid_image_without_loading_models():
    decoded = OpenCvFaceEngine.decode_image(jpeg_bytes())
    assert decoded.shape[:2] == (320, 320)


def test_decode_rejects_too_small_image():
    with pytest.raises(EkycImageError) as error:
        OpenCvFaceEngine.decode_image(jpeg_bytes(width=120, height=120))
    assert '240x240' in str(error.value)


def test_decode_rejects_corrupted_bytes():
    with pytest.raises(EkycImageError) as error:
        OpenCvFaceEngine.decode_image(b'not-a-real-image')
    assert 'Không đọc được' in str(error.value)
