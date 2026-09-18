import {
  Camera,
  CheckCircle2,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  Video,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  createPartnerEkycChallenge,
  verifyPartnerEkyc,
} from "../../services/profileService";
import { humanizeUserMessage } from "../../utils/userFacingText";

const SAMPLE_GAP_MS = 520;
const RETRY_GAP_MS = 850;
const SUCCESS_HOLD_MS = 1500;

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

async function captureVideoFrame(video, index) {
  if (!video?.videoWidth || !video?.videoHeight) {
    throw new Error("Camera chưa sẵn sàng. Vui lòng giữ mặt trước camera.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Trình duyệt không hỗ trợ chụp khung hình camera.");

  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Không chụp được ảnh camera.")),
      "image/jpeg",
      0.92,
    );
  });

  return new File([blob], `enziu-front-liveness-${index + 1}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function rawServerMessage(error) {
  const payload = error?.response?.data;
  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload?.detail === "string" && payload.detail.trim()) {
    return payload.detail;
  }
  if (Array.isArray(payload?.detail) && payload.detail.length) {
    return payload.detail
      .map((item) => item?.msg)
      .filter(Boolean)
      .join("; ");
  }
  return error?.message || "Không thể xác minh khuôn mặt.";
}

function extractServerMessage(error) {
  return humanizeUserMessage(rawServerMessage(error), {
    status: Number(error?.response?.status ?? 0),
    fallback: "Chưa thể xác minh khuôn mặt. Vui lòng thử lại.",
  });
}

function similarityPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number * 100));
}

function isChallengeExpired(message) {
  const value = String(message || "").toLowerCase();
  return value.includes("challenge đã hết hạn") || value.includes("challenge da het han");
}

function isRetryableCameraError(error) {
  const status = Number(error?.response?.status || 0);
  const message = rawServerMessage(error).toLowerCase();

  if (status === 401 || status === 403 || status === 429 || status >= 500) return false;
  if (message.includes("api key") || message.includes("bảo mật giữa")) return false;
  if (message.includes("cccd") && !message.includes("camera")) return false;
  if (message.includes("challenge token không hợp lệ")) return false;

  return status === 422;
}

export default function EkycCameraCapture({
  disabled = false,
  cccdFront,
  onReady,
  onInteraction,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanRunRef = useRef(0);

  const [, setChallenge] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [frames, setFrames] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [openingCamera, setOpeningCamera] = useState(false);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [autoScanning, setAutoScanning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [scanFeedback, setScanFeedback] = useState("");
  const [completed, setCompleted] = useState(false);
  const [verificationState, setVerificationState] = useState("idle");
  const [verificationResult, setVerificationResult] = useState(null);
  const [attemptNumber, setAttemptNumber] = useState(0);

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  useEffect(
    () => () => {
      scanRunRef.current += 1;
      stopStream(streamRef.current);
      streamRef.current = null;
    },
    [],
  );

  function invalidateScanLoop() {
    scanRunRef.current += 1;
    setAutoScanning(false);
    setCapturing(false);
    setVerifying(false);
  }

  function clearCaptureState({ stopCamera = true } = {}) {
    invalidateScanLoop();
    if (stopCamera) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }
    setChallenge(null);
    setCurrentIndex(0);
    setFrames([]);
    if (stopCamera) {
      setCameraActive(false);
      setCameraReady(false);
    }
    setCompleted(false);
    setVerificationState("idle");
    setVerificationResult(null);
    setScanFeedback("");
    setAttemptNumber(0);
    onReady?.(null);
  }

  function resetCapture() {
    clearCaptureState({ stopCamera: true });
    setError("");
  }

  async function openCamera() {
    onInteraction?.();
    resetCapture();
    setOpeningCamera(true);
    setError("");

    try {
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        throw new Error("Vui lòng mở EnziuRooms bằng kết nối an toàn (HTTPS) để sử dụng camera.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trình duyệt này không hỗ trợ truy cập camera.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      setCameraActive(true);
      setVerificationState("ready");
    } catch (startError) {
      stopStream(streamRef.current);
      streamRef.current = null;
      setCameraActive(false);
      setCameraReady(false);
      setVerificationState("error");
      setError(extractServerMessage(startError));
    } finally {
      setOpeningCamera(false);
    }
  }

  async function captureFrameBatch(runId) {
    const nextFrames = [];
    setFrames([]);
    setCurrentIndex(0);
    setCapturing(true);
    setVerificationState("scanning");

    for (let step = 0; step < 3; step += 1) {
      if (scanRunRef.current !== runId || !streamRef.current) return null;
      setCurrentIndex(step);
      if (step > 0) await sleep(SAMPLE_GAP_MS);
      if (scanRunRef.current !== runId || !streamRef.current) return null;
      const frame = await captureVideoFrame(videoRef.current, step);
      nextFrames.push(frame);
      setFrames([...nextFrames]);
    }

    setCapturing(false);
    return nextFrames;
  }

  function applySuccess(verification) {
    setVerificationResult(verification);
    setVerificationState("success");
    setCompleted(true);
    setScanFeedback("Khuôn mặt đã được xác minh thành công.");
    onReady?.({
      verified: true,
      verificationReceipt: verification.verificationReceipt,
      livenessVerified: verification.livenessVerified,
      faceVerified: verification.faceVerified,
      faceSimilarity: verification.faceSimilarity,
      faceMatchThreshold: verification.faceMatchThreshold,
      processedAt: verification.processedAt,
      expiresAt: verification.expiresAt,
    });
  }

  async function createFreshChallenge(runId) {
    if (scanRunRef.current !== runId) return null;
    setLoadingChallenge(true);
    try {
      const created = await createPartnerEkycChallenge();
      if (!created?.challengeToken || created?.challenges?.length !== 3) {
        throw new Error("Chưa thể bắt đầu bước xác minh. Vui lòng thử lại.");
      }
      if (scanRunRef.current !== runId) return null;
      setChallenge(created);
      return created;
    } finally {
      setLoadingChallenge(false);
    }
  }

  async function runContinuousScan(initialChallenge, runId) {
    let activeChallenge = initialChallenge;
    let infrastructureFailures = 0;

    while (scanRunRef.current === runId && streamRef.current) {
      try {
        setAttemptNumber((value) => value + 1);
        setError("");
        setScanFeedback("Giữ khuôn mặt chính diện trong vòng. EnziuRooms đang tự động kiểm tra...");

        const nextFrames = await captureFrameBatch(runId);
        if (!nextFrames || scanRunRef.current !== runId || !streamRef.current) return;

        setVerifying(true);
        setVerificationState("verifying");
        setScanFeedback("Đang đối chiếu khuôn mặt với ảnh trên CCCD...");

        const verification = await verifyPartnerEkyc(cccdFront, {
          challengeToken: activeChallenge.challengeToken,
          frames: nextFrames,
        });

        if (scanRunRef.current !== runId) return;
        setVerifying(false);
        infrastructureFailures = 0;

        if (verification?.verified && verification?.verificationReceipt) {
          applySuccess(verification);
          setAutoScanning(false);
          await sleep(SUCCESS_HOLD_MS);
          if (scanRunRef.current !== runId) return;
          stopStream(streamRef.current);
          streamRef.current = null;
          setCameraActive(false);
          setCameraReady(false);
          return;
        }

        setVerificationResult(verification || null);
        setVerificationState("retrying");
        setScanFeedback(
          verification?.guidance ||
            "Chưa nhận diện rõ. Hãy nhìn thẳng, giữ đủ sáng và chờ hệ thống kiểm tra lại.",
        );
        await sleep(RETRY_GAP_MS);
      } catch (scanError) {
        if (scanRunRef.current !== runId) return;
        setCapturing(false);
        setVerifying(false);

        const rawMessage = rawServerMessage(scanError);
        const message = extractServerMessage(scanError);
        if (isChallengeExpired(rawMessage)) {
          try {
            setVerificationState("verifying");
            setScanFeedback("Bước xác minh đang được làm mới. Vui lòng giữ nguyên khuôn mặt trong khung...");
            const renewed = await createFreshChallenge(runId);
            if (!renewed) return;
            activeChallenge = renewed;
            await sleep(350);
            continue;
          } catch (renewError) {
            setVerificationState("error");
            setError(extractServerMessage(renewError));
            setAutoScanning(false);
            return;
          }
        }

        if (isRetryableCameraError(scanError)) {
          setVerificationState("retrying");
          setScanFeedback(`${message} EnziuRooms sẽ tự kiểm tra lại, bạn không cần bấm thêm.`);
          await sleep(RETRY_GAP_MS + 250);
          continue;
        }

        infrastructureFailures += 1;
        if (infrastructureFailures < 3 && Number(scanError?.response?.status || 0) === 0) {
          setVerificationState("retrying");
          setScanFeedback("Kết nối chưa ổn định. EnziuRooms đang thử lại...");
          await sleep(1400);
          continue;
        }

        setVerificationState("error");
        setError(message);
        setAutoScanning(false);
        return;
      }
    }
  }

  async function beginChallenge() {
    if (!cameraActive || !cameraReady || loadingChallenge || autoScanning || completed) return;
    onInteraction?.();

    const runId = scanRunRef.current + 1;
    scanRunRef.current = runId;
    setAutoScanning(true);
    setError("");
    setScanFeedback("Đang chuẩn bị camera. Sau đó bạn chỉ cần giữ khuôn mặt trong vòng đến khi vòng chuyển xanh.");
    setVerificationState("scanning");
    setChallenge(null);
    setCurrentIndex(0);
    setFrames([]);
    setVerificationResult(null);
    setAttemptNumber(0);
    onReady?.(null);

    try {
      const created = await createFreshChallenge(runId);
      if (!created) return;
      void runContinuousScan(created, runId);
    } catch (challengeError) {
      setVerificationState("error");
      setError(extractServerMessage(challengeError));
      setAutoScanning(false);
    }
  }

  const percent = similarityPercent(verificationResult?.faceSimilarity);
  const guideClass = `partner-camera-face-guide ${verificationState}`;
  const scanInProgress = autoScanning || capturing || verifying || loadingChallenge;

  return (
    <section className={`partner-ekyc-card ${completed ? "verified" : ""}`}>
      <div className="partner-ekyc-heading">
        <div className="partner-ekyc-heading-icon">
          {completed ? <ShieldCheck size={23} /> : <Camera size={23} />}
        </div>
        <div>
          <span>BƯỚC 2 · XÁC MINH KHUÔN MẶT</span>
          <h3>{completed ? "Xác minh khuôn mặt thành công" : "Xác minh khuôn mặt bằng camera"}</h3>
          <p>
            Bấm “Tôi đã sẵn sàng” một lần rồi nhìn thẳng vào camera. EnziuRooms sẽ tự kiểm tra
            cho đến khi xác minh hoàn tất và vòng chuyển xanh.
          </p>
        </div>
      </div>

      {error ? (
        <div className="partner-ekyc-error" role="alert">
          <strong>Chưa thể tiếp tục xác minh</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {cameraActive ? (
        <div className="partner-camera-stage">
          <div className="partner-camera-video-wrap">
            <video
              ref={videoRef}
              muted
              playsInline
              className="partner-camera-video"
              onLoadedMetadata={() => setCameraReady(true)}
            />
            <div className={guideClass} aria-hidden="true" />

            <div className={`partner-camera-live-status ${verificationState}`}>
              {verificationState === "success" ? <CheckCircle2 size={18} /> : null}
              {verificationState === "error" ? <XCircle size={18} /> : null}
              {scanInProgress && verificationState !== "success" ? (
                <LoaderCircle className="spin" size={18} />
              ) : null}
              <span>
                {verificationState === "success"
                  ? "Xác minh thành công"
                  : verificationState === "error"
                    ? "Xác minh đã dừng"
                    : verificationState === "retrying"
                      ? "Chưa rõ - đang kiểm tra lại..."
                      : verificationState === "verifying"
                        ? "Đang đối chiếu với CCCD..."
                        : verificationState === "scanning"
                          ? "Đang kiểm tra..."
                          : cameraReady
                            ? "Đưa mặt vào giữa vòng"
                            : "Đang mở camera..."}
              </span>
            </div>

            {verificationState === "success" ? (
              <div className="partner-camera-success-mark" aria-hidden="true">
                <CheckCircle2 size={52} />
              </div>
            ) : null}
          </div>

          <div className="partner-camera-instruction">
            {scanInProgress || verificationState === "retrying" || verificationState === "success" ? (
              <>
                <small>
                  {verificationState === "success"
                    ? "ĐÃ XÁC MINH"
                    : `ĐANG XÁC MINH${attemptNumber ? ` · LẦN ${attemptNumber}` : ""}`}
                </small>
                <strong>
                  {verificationState === "success"
                    ? "Vòng xanh - khuôn mặt hợp lệ"
                    : verificationState === "verifying"
                      ? "Giữ nguyên mặt trong vòng"
                      : "Không cần bấm lại"}
                </strong>
                <span>
                  {verificationState === "success"
                    ? `Khuôn mặt đã khớp với ảnh trên CCCD${percent == null ? "." : ` (${percent.toFixed(1)}%).`}`
                    : scanFeedback || "Hãy nhìn thẳng và giữ đủ sáng. EnziuRooms sẽ tự kiểm tra lại nếu cần."}
                </span>
                <div className="partner-camera-progress" aria-hidden="true">
                  {[0, 1, 2].map((step) => (
                    <i
                      key={step}
                      className={
                        verificationState === "success" || step < frames.length
                          ? "done"
                          : step === currentIndex && capturing
                            ? "active"
                            : ""
                      }
                    />
                  ))}
                </div>
                <div className="partner-camera-precheck">
                  <i className={verificationState === "success" ? "ready" : ""} />
                  {verificationState === "success"
                    ? "Vòng xanh nghĩa là đã xác minh. Bạn có thể tiếp tục hồ sơ."
                    : "Camera sẽ tiếp tục kiểm tra. Chỉ đóng camera nếu bạn muốn dừng."}
                </div>
                {verificationState !== "success" ? (
                  <button type="button" className="partner-camera-cancel-button" onClick={resetCapture}>
                    Dừng xác minh và đóng camera
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <small>CHUẨN BỊ CAMERA</small>
                <strong>Đưa khuôn mặt vào giữa vòng</strong>
                <span>
                  Nhìn thẳng và giữ đủ sáng. Sau khi bấm “Tôi đã sẵn sàng”, bạn không cần
                  bấm thêm lần nào; EnziuRooms sẽ tự kiểm tra đến khi vòng chuyển xanh.
                </span>
                <div className="partner-camera-precheck">
                  <i className={cameraReady ? "ready" : ""} />
                  {cameraReady ? "Camera đã sẵn sàng" : "Đang khởi động camera..."}
                </div>
                <button
                  type="button"
                  className="partner-camera-capture-button"
                  disabled={!cameraReady || loadingChallenge || autoScanning}
                  onClick={beginChallenge}
                >
                  <ShieldCheck size={18} />
                  {loadingChallenge ? "Đang chuẩn bị..." : "Tôi đã sẵn sàng"}
                </button>
                <button type="button" className="partner-camera-cancel-button" onClick={resetCapture}>
                  Đóng camera
                </button>
              </>
            )}
          </div>
        </div>
      ) : completed ? (
        <div className="partner-ekyc-ready partner-ekyc-ready-confirmed">
          <CheckCircle2 size={28} />
          <div>
            <strong>Xác minh khuôn mặt thành công</strong>
            <span>
              Khuôn mặt đã được xác minh trước khi gửi hồ sơ
              {percent == null ? "." : ` · độ tương đồng ${percent.toFixed(1)}%.`}
              {verificationResult?.expiresAt ? " Kết quả được giữ trong 10 phút để bạn hoàn tất hồ sơ." : ""}
            </span>
          </div>
          <button type="button" onClick={resetCapture}>
            <RefreshCcw size={16} /> Quét lại
          </button>
        </div>
      ) : (
        <div className="partner-ekyc-start">
          <div>
            <Video size={23} />
            <span>
              Sau khi bắt đầu, hãy giữ khuôn mặt trong khung. EnziuRooms sẽ tự kiểm tra
              đến khi vòng chuyển xanh hoặc bạn chủ động dừng.
            </span>
          </div>
          <div className="partner-ekyc-start-actions">
            {disabled ? (
              <small className="partner-ekyc-disabled-hint">
                Vui lòng hoàn tất bước kiểm tra CCCD trước khi mở camera.
              </small>
            ) : null}
            <button type="button" disabled={disabled || openingCamera} onClick={openCamera}>
              <Camera size={18} />
              {openingCamera ? "Đang mở camera..." : "Bắt đầu xác minh khuôn mặt"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
