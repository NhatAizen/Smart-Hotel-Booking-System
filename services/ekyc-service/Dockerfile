FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /app/models

# OpenCV Zoo models. Both are free/open-source and downloaded at image-build time.
ARG YUNET_URL=https://huggingface.co/opencv/opencv_zoo/resolve/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
ARG YUNET_SHA256=8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
ARG SFACE_URL=https://huggingface.co/opencv/opencv_zoo/resolve/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx
ARG SFACE_SHA256=0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79

RUN curl -L --fail --retry 4 --retry-delay 2 "$YUNET_URL" -o /app/models/face_detection_yunet_2023mar.onnx \
    && echo "$YUNET_SHA256  /app/models/face_detection_yunet_2023mar.onnx" | sha256sum -c - \
    && curl -L --fail --retry 4 --retry-delay 2 "$SFACE_URL" -o /app/models/face_recognition_sface_2021dec.onnx \
    && echo "$SFACE_SHA256  /app/models/face_recognition_sface_2021dec.onnx" | sha256sum -c -

COPY app app

RUN useradd --create-home --uid 10001 ekyc \
    && chown -R ekyc:ekyc /app
USER ekyc

EXPOSE 8090

HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=3).read()" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1", "--proxy-headers"]
