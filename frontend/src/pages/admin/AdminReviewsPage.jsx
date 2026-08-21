import {
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState, Modal, StatusBadge } from "../../components/ui";
import {
  getSystemAdminReviews,
  hideSystemAdminReview,
  restoreSystemAdminReview,
} from "../../services/bookingService";
import "../shared/ReviewManagementPage.css";

function formatDate(value) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function replyText(review) {
  return review?.hotelReply ?? review?.replyContent ?? review?.reply ?? "";
}

function statusOf(review) {
  return String(review?.moderationStatus ?? review?.status ?? "VISIBLE").toUpperCase();
}

function requestMessage(error, fallback) {
  return error?.response?.data?.message ?? error?.message ?? fallback;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [replyFilter, setReplyFilter] = useState("ALL");
  const [scoreFilter, setScoreFilter] = useState("ALL");
  const [busyId, setBusyId] = useState("");
  const [hideTarget, setHideTarget] = useState(null);
  const [hideReason, setHideReason] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const payload = await getSystemAdminReviews();
      setReviews(Array.isArray(payload) ? payload : []);
    } catch (requestError) {
      setError(requestMessage(requestError, "Không thể tải danh sách đánh giá toàn hệ thống."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const hidden = reviews.filter((review) => statusOf(review) === "HIDDEN").length;
    const replied = reviews.filter((review) => Boolean(replyText(review).trim())).length;
    const ratings = reviews
      .filter((review) => statusOf(review) !== "HIDDEN")
      .map((review) => Number(review.rating))
      .filter(Number.isFinite);
    const average = ratings.length
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : null;

    return { total: reviews.length, hidden, replied, average };
  }, [reviews]);

  const filtered = useMemo(() => {
    const keyword = normalize(query.trim());
    return reviews
      .filter((review) => {
        const status = statusOf(review);
        const replied = Boolean(replyText(review).trim());
        if (statusFilter !== "ALL" && status !== statusFilter) return false;
        if (replyFilter === "REPLIED" && !replied) return false;
        if (replyFilter === "WAITING" && replied) return false;
        if (scoreFilter !== "ALL" && Math.floor(Number(review.rating)) !== Number(scoreFilter)) return false;
        if (!keyword) return true;
        return [
          review.customerName,
          review.hotelName,
          review.title,
          review.positiveComment,
          review.negativeComment,
          replyText(review),
          review.hiddenReason,
        ].some((value) => normalize(value).includes(keyword));
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [query, replyFilter, reviews, scoreFilter, statusFilter]);

  function openHide(review) {
    setHideTarget(review);
    setHideReason("");
    setError("");
    setMessage("");
  }

  async function confirmHide() {
    if (!hideTarget) return;
    const reason = hideReason.trim();
    if (!reason) {
      setError("Vui lòng nhập lý do ẩn đánh giá để lưu lịch sử kiểm duyệt.");
      return;
    }
    if (reason.length > 500) {
      setError("Lý do kiểm duyệt tối đa 500 ký tự.");
      return;
    }

    setBusyId(hideTarget.id);
    setError("");
    try {
      const updated = await hideSystemAdminReview(hideTarget.id, reason);
      setReviews((current) => current.map((review) => (
        review.id === hideTarget.id
          ? { ...review, ...(updated && typeof updated === "object" ? updated : {}), moderationStatus: "HIDDEN", hiddenReason: updated?.hiddenReason ?? reason }
          : review
      )));
      setHideTarget(null);
      setHideReason("");
      setMessage("Đã ẩn đánh giá khỏi trang công khai và điểm trung bình.");
      await load({ quiet: true });
    } catch (requestError) {
      setError(requestMessage(requestError, "Không thể ẩn đánh giá."));
    } finally {
      setBusyId("");
    }
  }

  async function restore(review) {
    if (!window.confirm("Khôi phục đánh giá này để hiển thị lại trên hệ thống?")) return;

    setBusyId(review.id);
    setError("");
    setMessage("");
    try {
      const updated = await restoreSystemAdminReview(review.id);
      setReviews((current) => current.map((item) => (
        item.id === review.id
          ? { ...item, ...(updated && typeof updated === "object" ? updated : {}), moderationStatus: "VISIBLE", hiddenReason: null, hiddenAt: null, hiddenBy: null }
          : item
      )));
      setMessage("Đã khôi phục đánh giá.");
      await load({ quiet: true });
    } catch (requestError) {
      setError(requestMessage(requestError, "Không thể khôi phục đánh giá."));
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return (
      <div className="review-management-page">
        <LoadingState message="Đang tải trung tâm kiểm duyệt đánh giá..." />
      </div>
    );
  }

  return (
    <main className="review-management-page">
      <section className="review-management-hero">
        <div>
          <span className="review-management-kicker"><ShieldCheck size={15} /> KIỂM DUYỆT NỘI DUNG</span>
          <h1>Quản lý đánh giá</h1>
          <p>
            Xem review trên toàn EnziuRooms, ẩn nội dung vi phạm và khôi phục khi cần. Quản trị không chỉnh sửa lời khách hoặc phản hồi thay khách sạn.
          </p>
        </div>
        <button type="button" className="review-management-refresh" onClick={() => void load({ quiet: true })} disabled={refreshing}>
          <RefreshCw size={17} /> {refreshing ? "Đang tải..." : "Làm mới"}
        </button>
      </section>

      <section className="review-management-stats">
        <article className="review-management-stat"><span>Tổng đánh giá</span><strong>{stats.total}</strong></article>
        <article className="review-management-stat"><span>Đang hiển thị</span><strong>{Math.max(0, stats.total - stats.hidden)}</strong></article>
        <article className="review-management-stat"><span>Đã ẩn</span><strong>{stats.hidden}</strong></article>
        <article className="review-management-stat"><span>Điểm công khai TB</span><strong>{stats.average == null ? "—" : `${stats.average.toFixed(1)}/10`}</strong></article>
      </section>

      {message ? <div className="review-management-message" role="status">{message}</div> : null}
      {error ? <ErrorState message={error} onRetry={() => void load({ quiet: true })} /> : null}

      <section className="review-management-toolbar">
        <label className="review-management-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm khách sạn, khách hàng hoặc nội dung..." />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">Tất cả trạng thái</option>
          <option value="VISIBLE">Đang hiển thị</option>
          <option value="HIDDEN">Đã ẩn</option>
        </select>
        <select value={replyFilter} onChange={(event) => setReplyFilter(event.target.value)}>
          <option value="ALL">Tất cả phản hồi</option>
          <option value="WAITING">Chưa được hotel phản hồi</option>
          <option value="REPLIED">Hotel đã phản hồi</option>
        </select>
        <select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)}>
          <option value="ALL">Tất cả điểm</option>
          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>{score}/10</option>)}
        </select>
      </section>

      {filtered.length === 0 ? (
        <EmptyState icon={<Star size={30} />} title="Chưa có đánh giá phù hợp" description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." />
      ) : (
        <section className="review-management-list">
          {filtered.map((review) => {
            const hidden = statusOf(review) === "HIDDEN";
            const reply = replyText(review);
            return (
              <article className={`review-management-card${hidden ? " is-hidden" : ""}`} key={review.id}>
                <header className="review-management-card-head">
                  <div className="review-management-author">
                    <span className="review-management-avatar">
                      {review.customerAvatarUrl ? <img src={review.customerAvatarUrl} alt="" /> : String(review.customerName ?? "K").charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <strong>{review.customerName ?? "Khách EnziuRooms"}</strong>
                      <small>{review.hotelName ?? `Khách sạn ${review.hotelId ?? ""}`}</small>
                    </div>
                  </div>
                  <div className="review-management-head-right">
                    <StatusBadge label={hidden ? "Đã ẩn" : "Đang hiển thị"} tone={hidden ? "warning" : "success"} icon={hidden ? <EyeOff size={14} /> : <Eye size={14} />} dot={false} />
                    {reply ? <StatusBadge label="Hotel đã phản hồi" tone="info" /> : null}
                    <strong className="review-management-score">{Number.isFinite(Number(review.rating)) ? Number(review.rating).toFixed(1) : "—"}</strong>
                  </div>
                </header>

                <div className="review-management-body">
                  <aside className="review-management-meta">
                    <p><strong>Ngày đánh giá</strong>{formatDate(review.createdAt)}</p>
                    <p><strong>Booking</strong>{review.bookingCode ?? review.bookingId ?? "Đã xác minh"}</p>
                    <p><strong>Review ID</strong>{review.id}</p>
                  </aside>
                  <div className="review-management-copy">
                    <h3>{review.title || "Trải nghiệm lưu trú"}</h3>
                    {review.positiveComment ? <div className="review-management-sentiment positive"><span>{review.positiveComment}</span></div> : null}
                    {review.negativeComment ? <div className="review-management-sentiment negative"><span>{review.negativeComment}</span></div> : null}
                    {Array.isArray(review.images) && review.images.length ? (
                      <div className="review-management-images">{review.images.slice(0, 6).map((src, index) => <img key={`${src}-${index}`} src={src} alt={`Ảnh đánh giá ${index + 1}`} />)}</div>
                    ) : null}
                  </div>
                </div>

                {reply ? (
                  <div className="review-management-reply">
                    <div className="review-management-reply-head"><strong>Phản hồi chính thức từ khách sạn</strong><small>{formatDate(review.hotelReplyAt ?? review.replyAt)}</small></div>
                    <p>{reply}</p>
                  </div>
                ) : null}

                {hidden ? (
                  <div className="review-hidden-reason">
                    <strong>Lý do đã ẩn</strong>
                    {review.hiddenReason || "Không có ghi chú."}
                    {review.hiddenAt ? <div><small>Thời gian: {formatDate(review.hiddenAt)}</small></div> : null}
                  </div>
                ) : null}

                <footer className="review-management-actions">
                  {hidden ? (
                    <button type="button" className="review-management-button primary" disabled={Boolean(busyId)} onClick={() => void restore(review)}><Eye size={16} /> {busyId === review.id ? "Đang khôi phục..." : "Khôi phục"}</button>
                  ) : (
                    <button type="button" className="review-management-button warning" disabled={Boolean(busyId)} onClick={() => openHide(review)}><EyeOff size={16} /> Ẩn đánh giá</button>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      )}

      <p className="review-management-footer-note">
        Review bị ẩn phải được backend loại khỏi endpoint public và khỏi phép tính averageRating/reviewCount, nhưng vẫn giữ trong cơ sở dữ liệu để System Admin có thể khôi phục.
      </p>

      <Modal
        open={Boolean(hideTarget)}
        onClose={() => {
          if (!busyId) {
            setHideTarget(null);
            setHideReason("");
          }
        }}
        title="Ẩn đánh giá"
        description="Đánh giá sẽ biến mất khỏi trang khách sạn và không còn được tính vào điểm trung bình."
        size="md"
        className="review-moderation-modal"
        closeOnBackdrop={!busyId}
        closeOnEscape={!busyId}
      >
        <p>Nhập lý do rõ ràng để lưu lịch sử kiểm duyệt.</p>
        <textarea
          autoFocus
          maxLength={500}
          value={hideReason}
          onChange={(event) => setHideReason(event.target.value)}
          placeholder="Ví dụ: Nội dung spam, quảng cáo không liên quan hoặc vi phạm quy định cộng đồng..."
        />
        <div className="review-moderation-modal-actions">
          <button type="button" className="review-management-button" disabled={Boolean(busyId)} onClick={() => setHideTarget(null)}>Hủy</button>
          <button type="button" className="review-management-button warning" disabled={Boolean(busyId) || !hideReason.trim()} onClick={() => void confirmHide()}>{busyId ? "Đang xử lý..." : "Xác nhận ẩn"}</button>
        </div>
      </Modal>
    </main>
  );
}
