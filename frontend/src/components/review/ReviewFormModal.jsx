import {
  Camera,
  CheckCircle2,
  ImagePlus,
  MessageCircleMore,
  MinusCircle,
  Send,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import ErrorMessage from "../common/ErrorMessage";
import { createHotelReview } from "../../services/bookingService";
import "./ReviewFormModal.css";

const SCORE_FIELDS = [
  ["staffRating", "Nhân viên phục vụ"],
  ["facilitiesRating", "Tiện nghi"],
  ["cleanlinessRating", "Sạch sẽ"],
  ["comfortRating", "Thoải mái"],
  ["valueRating", "Đáng giá tiền"],
  ["locationRating", "Địa điểm"],
  ["wifiRating", "WiFi miễn phí"],
];

function createInitialScores() {
  return Object.fromEntries(SCORE_FIELDS.map(([key]) => [key, 8]));
}

function scoreLabel(score) {
  if (score >= 9) return "Tuyệt hảo";
  if (score >= 8) return "Rất tốt";
  if (score >= 7) return "Tốt";
  if (score >= 6) return "Khá";
  if (score >= 5) return "Ổn";
  return "Cần cải thiện";
}

export default function ReviewFormModal({
  booking,
  hotel,
  roomType,
  onClose,
  onSubmitted,
}) {
  const [scores, setScores] = useState(createInitialScores);
  const [overallRating, setOverallRating] = useState(8);
  const [title, setTitle] = useState("");
  const [positiveComment, setPositiveComment] = useState("");
  const [negativeComment, setNegativeComment] = useState("");
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const previews = useMemo(
    () => files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    })),
    [files],
  );

  useEffect(() => () => {
    previews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [previews]);

  useEffect(() => {
    const values = Object.values(scores).filter((value) => Number(value) > 0);
    if (values.length === 0) return;
    const average = Math.round(
      values.reduce((sum, value) => sum + Number(value), 0) / values.length,
    );
    setOverallRating(Math.max(1, Math.min(10, average)));
  }, [scores]);

  useEffect(() => {
    function onEscape(event) {
      if (event.key === "Escape" && !submitting) onClose();
    }

    document.addEventListener("keydown", onEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [onClose, submitting]);

  function addFiles(event) {
    const selected = Array.from(event.target.files ?? []);

    setError("");
    setFiles((current) => {
      const existing = new Set(
        current.map((file) => `${file.name}-${file.size}-${file.lastModified}`),
      );

      const merged = [...current];
      for (const file of selected) {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (existing.has(key)) continue;

        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          setError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.");
          continue;
        }

        if (file.size > 5 * 1024 * 1024) {
          setError("Mỗi ảnh tối đa 5 MB.");
          continue;
        }

        if (merged.length >= 6) {
          setError("Mỗi đánh giá chỉ được thêm tối đa 6 ảnh.");
          break;
        }

        merged.push(file);
        existing.add(key);
      }

      return merged;
    });

    event.target.value = "";
  }

  function removeFile(index) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!positiveComment.trim()) {
      setError("Hãy chia sẻ điều bạn thích về kỳ nghỉ.");
      return;
    }

    if (!consent) {
      setError("Bạn cần xác nhận đây là đánh giá từ trải nghiệm thực tế.");
      return;
    }

    setSubmitting(true);

    try {
      const review = await createHotelReview(
        {
          bookingId: booking.id,
          rating: overallRating,
          ...scores,
          title: title.trim() || null,
          positiveComment: positiveComment.trim(),
          negativeComment: negativeComment.trim() || null,
        },
        files,
      );

      onSubmitted(review);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.response?.data?.error
          ?? "Không thể gửi đánh giá. Vui lòng thử lại.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="review-form-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section
        className="review-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Đánh giá khách sạn"
      >
        <button
          type="button"
          className="review-form-close"
          onClick={onClose}
          disabled={submitting}
          aria-label="Đóng"
        >
          <X size={24} />
        </button>

        <header className="review-form-header">
          <div className="review-form-hotel-mark">
            <Sparkles size={24} />
          </div>
          <div>
            <span>CHUYẾN ĐI ĐÃ HOÀN TẤT</span>
            <h2>Đánh giá kỳ nghỉ của bạn</h2>
            <p>
              Chia sẻ trải nghiệm tại <strong>{hotel?.name ?? "khách sạn"}</strong>.
              Đánh giá của bạn sẽ giúp những khách khác lựa chọn tốt hơn.
            </p>
          </div>
        </header>

        <div className="review-form-stay-summary">
          <div>
            <small>Khách sạn</small>
            <strong>{hotel?.name ?? "EnziuRooms Hotel"}</strong>
          </div>
          <div>
            <small>Loại phòng</small>
            <strong>{roomType?.name ?? "Phòng đã lưu trú"}</strong>
          </div>
          <div>
            <small>Kỳ nghỉ</small>
            <strong>{booking.checkIn} → {booking.checkOut}</strong>
          </div>
        </div>

        <form onSubmit={submit}>
          <section className="review-score-section">
            <div className="review-form-section-title">
              <Star size={21} />
              <div>
                <h3>Chấm điểm kỳ nghỉ</h3>
                <p>1 là rất chưa hài lòng, 10 là tuyệt vời.</p>
              </div>
            </div>

            <div className="review-overall-score">
              <div>
                <small>Điểm tổng thể</small>
                <strong>{overallRating.toFixed(1)}</strong>
                <span>{scoreLabel(overallRating)}</span>
              </div>
              <div className="review-score-dots" aria-label="Điểm tổng thể">
                {Array.from({ length: 10 }).map((_, index) => {
                  const value = index + 1;
                  return (
                    <button
                      type="button"
                      key={value}
                      className={value <= overallRating ? "active" : ""}
                      onClick={() => setOverallRating(value)}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="review-category-grid">
              {SCORE_FIELDS.map(([key, label]) => (
                <label key={key}>
                  <span>
                    {label}
                    <strong>{scores[key]}/10</strong>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={scores[key]}
                    onChange={(event) =>
                      setScores((current) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="review-writing-section">
            <div className="review-form-section-title">
              <MessageCircleMore size={21} />
              <div>
                <h3>Chia sẻ nhận xét</h3>
                <p>Viết cụ thể những điều bạn đã trải nghiệm trong kỳ nghỉ.</p>
              </div>
            </div>

            <label className="review-text-field">
              <span>Tiêu đề ngắn <small>(không bắt buộc)</small></span>
              <input
                type="text"
                maxLength={180}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ví dụ: Kỳ nghỉ tuyệt vời ở trung tâm thành phố"
              />
              <small>{title.length}/180</small>
            </label>

            <label className="review-text-field positive">
              <span>
                <CheckCircle2 size={18} />
                Bạn thích điều gì nhất?
              </span>
              <textarea
                rows={4}
                maxLength={3000}
                value={positiveComment}
                onChange={(event) => setPositiveComment(event.target.value)}
                placeholder="Ví dụ: Nhân viên thân thiện, phòng sạch, vị trí thuận tiện..."
              />
              <small>{positiveComment.length}/3000</small>
            </label>

            <label className="review-text-field negative">
              <span>
                <MinusCircle size={18} />
                Điều gì có thể tốt hơn? <small>(không bắt buộc)</small>
              </span>
              <textarea
                rows={3}
                maxLength={3000}
                value={negativeComment}
                onChange={(event) => setNegativeComment(event.target.value)}
                placeholder="Ví dụ: Phòng cách âm chưa tốt, thời gian chờ thang máy hơi lâu..."
              />
              <small>{negativeComment.length}/3000</small>
            </label>
          </section>

          <section className="review-image-section">
            <div className="review-form-section-title">
              <Camera size={21} />
              <div>
                <h3>Ảnh từ kỳ nghỉ</h3>
                <p>Tối đa 6 ảnh JPG, PNG hoặc WEBP · mỗi ảnh tối đa 5 MB.</p>
              </div>
            </div>

            <div className="review-image-picker">
              {previews.map((item, index) => (
                <div className="review-image-preview" key={item.url}>
                  <img src={item.url} alt={`Ảnh đánh giá ${index + 1}`} />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label="Xóa ảnh"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}

              {files.length < 6 ? (
                <label className="review-add-image">
                  <ImagePlus size={26} />
                  <strong>Thêm ảnh</strong>
                  <span>{files.length}/6</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={addFiles}
                  />
                </label>
              ) : null}
            </div>
          </section>

          <label className="review-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              Tôi xác nhận đánh giá này dựa trên kỳ nghỉ thực tế của mình và không
              chứa thông tin sai lệch.
            </span>
          </label>

          <ErrorMessage message={error} />

          <footer className="review-form-footer">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Để sau
            </button>
            <button
              type="submit"
              className="primary"
              disabled={submitting}
            >
              <Send size={18} />
              {submitting ? "Đang gửi..." : "Gửi đánh giá"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
