import {
  CheckCircle2,
  Edit3,
  Frown,
  Hotel,
  MessageSquareReply,
  RefreshCw,
  Search,
  Smile,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AvatarImage, EmptyState, ErrorState, LoadingState, StatusBadge } from "../../components/ui";
import {
  createHotelReviewReply,
  deleteHotelReviewReply,
  getHotelAdminReviews,
  getHotelReviews,
  updateHotelReviewReply,
} from "../../services/bookingService";
import { getMyHotels } from "../../services/hotelAdminService";
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

function replyTime(review) {
  return review?.hotelReplyAt ?? review?.replyAt ?? null;
}

function moderationStatus(review) {
  return String(review?.moderationStatus ?? review?.status ?? "VISIBLE").toUpperCase();
}

function requestMessage(error, fallback) {
  return error?.response?.data?.message ?? error?.message ?? fallback;
}

async function fallbackReviewsForHotels(hotels) {
  const groups = await Promise.all(
    hotels.map(async (hotel) => {
      try {
        const values = await getHotelReviews(hotel.id);
        return (Array.isArray(values) ? values : []).map((review) => ({
          ...review,
          hotelId: review.hotelId ?? hotel.id,
          hotelName: review.hotelName ?? hotel.name,
        }));
      } catch {
        return [];
      }
    }),
  );
  return groups.flat();
}

export default function HotelReviewsPage() {
  const [hotels, setHotels] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState("ALL");
  const [replyFilter, setReplyFilter] = useState("ALL");
  const [scoreFilter, setScoreFilter] = useState("ALL");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const hotelPayload = await getMyHotels();
      const managedHotels = Array.isArray(hotelPayload) ? hotelPayload : [];
      setHotels(managedHotels);

      let reviewPayload;
      try {
        reviewPayload = await getHotelAdminReviews();
      } catch (requestError) {
        if ([404, 405].includes(requestError?.response?.status)) {
          reviewPayload = await fallbackReviewsForHotels(managedHotels);
        } else {
          throw requestError;
        }
      }

      setReviews(Array.isArray(reviewPayload) ? reviewPayload : []);
    } catch (requestError) {
      setError(requestMessage(requestError, "Không thể tải đánh giá của khách sạn."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hotelMap = useMemo(
    () => Object.fromEntries(hotels.map((hotel) => [String(hotel.id), hotel])),
    [hotels],
  );

  const stats = useMemo(() => {
    const visible = reviews.filter((review) => moderationStatus(review) !== "HIDDEN");
    const replied = visible.filter((review) => Boolean(replyText(review).trim())).length;
    const ratings = visible.map((review) => Number(review.rating)).filter(Number.isFinite);
    const average = ratings.length
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : null;

    return {
      total: reviews.length,
      awaiting: Math.max(0, visible.length - replied),
      replied,
      average,
    };
  }, [reviews]);

  const filtered = useMemo(() => {
    const keyword = normalize(query.trim());

    return reviews
      .filter((review) => {
        if (hotelFilter !== "ALL" && String(review.hotelId) !== hotelFilter) return false;
        const hasReply = Boolean(replyText(review).trim());
        if (replyFilter === "REPLIED" && !hasReply) return false;
        if (replyFilter === "WAITING" && hasReply) return false;
        if (scoreFilter !== "ALL" && Math.floor(Number(review.rating)) !== Number(scoreFilter)) {
          return false;
        }

        if (!keyword) return true;
        const hotel = hotelMap[String(review.hotelId)];
        return [
          review.customerName,
          review.title,
          review.positiveComment,
          review.negativeComment,
          replyText(review),
          review.hotelName,
          hotel?.name,
        ].some((value) => normalize(value).includes(keyword));
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [hotelFilter, hotelMap, query, replyFilter, reviews, scoreFilter]);

  function beginReply(review) {
    setEditingId(review.id);
    setDraft(replyText(review));
    setError("");
    setMessage("");
  }

  function cancelReply() {
    if (busyId) return;
    setEditingId("");
    setDraft("");
  }

  async function saveReply(review) {
    const content = draft.trim();
    if (!content) {
      setError("Vui lòng nhập nội dung phản hồi trước khi gửi.");
      return;
    }
    if (content.length > 1500) {
      setError("Phản hồi tối đa 1.500 ký tự.");
      return;
    }

    setBusyId(review.id);
    setError("");
    setMessage("");
    try {
      const updated = replyText(review).trim()
        ? await updateHotelReviewReply(review.id, content)
        : await createHotelReviewReply(review.id, content);

      setReviews((current) => current.map((item) => (
        item.id === review.id
          ? { ...item, ...(updated && typeof updated === "object" ? updated : {}), hotelReply: updated?.hotelReply ?? content }
          : item
      )));
      setMessage(replyText(review).trim() ? "Đã cập nhật phản hồi." : "Đã gửi phản hồi cho khách.");
      setEditingId("");
      setDraft("");
      await load({ quiet: true });
    } catch (requestError) {
      setError(requestMessage(requestError, "Không thể lưu phản hồi đánh giá."));
    } finally {
      setBusyId("");
    }
  }

  async function removeReply(review) {
    if (!window.confirm("Xóa phản hồi của khách sạn khỏi đánh giá này?")) return;

    setBusyId(review.id);
    setError("");
    setMessage("");
    try {
      await deleteHotelReviewReply(review.id);
      setReviews((current) => current.map((item) => (
        item.id === review.id
          ? { ...item, hotelReply: null, hotelReplyAt: null, hotelReplyBy: null }
          : item
      )));
      setMessage("Đã xóa phản hồi của khách sạn.");
      await load({ quiet: true });
    } catch (requestError) {
      setError(requestMessage(requestError, "Không thể xóa phản hồi đánh giá."));
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return (
      <div className="review-management-page">
        <LoadingState message="Đang tải đánh giá của khách..." />
      </div>
    );
  }

  return (
    <main className="review-management-page">
      <section className="review-management-hero">
        <div>
          <span className="review-management-kicker"><Star size={15} /> CHĂM SÓC KHÁCH HÀNG</span>
          <h1>Đánh giá khách sạn</h1>
          <p>
            Theo dõi nhận xét sau lưu trú và phản hồi với tư cách khách sạn. Bạn chỉ có thể
            thao tác trên đánh giá thuộc khách sạn mình quản lý.
          </p>
        </div>
        <button
          type="button"
          className="review-management-refresh"
          disabled={refreshing}
          onClick={() => void load({ quiet: true })}
        >
          <RefreshCw size={17} /> {refreshing ? "Đang tải..." : "Làm mới"}
        </button>
      </section>

      <section className="review-management-stats">
        <article className="review-management-stat"><span>Tổng đánh giá</span><strong>{stats.total}</strong></article>
        <article className="review-management-stat"><span>Chờ phản hồi</span><strong>{stats.awaiting}</strong></article>
        <article className="review-management-stat"><span>Đã phản hồi</span><strong>{stats.replied}</strong></article>
        <article className="review-management-stat"><span>Điểm trung bình</span><strong>{stats.average == null ? "—" : `${stats.average.toFixed(1)}/10`}</strong></article>
      </section>

      {message ? <div className="review-management-message" role="status">{message}</div> : null}
      {error ? <ErrorState message={error} onRetry={() => void load({ quiet: true })} /> : null}

      <section className="review-management-toolbar">
        <label className="review-management-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm khách, nội dung hoặc phản hồi..." />
        </label>

        <select value={hotelFilter} onChange={(event) => setHotelFilter(event.target.value)} aria-label="Lọc khách sạn">
          <option value="ALL">Tất cả khách sạn</option>
          {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
        </select>

        <select value={replyFilter} onChange={(event) => setReplyFilter(event.target.value)} aria-label="Lọc phản hồi">
          <option value="ALL">Tất cả phản hồi</option>
          <option value="WAITING">Chưa phản hồi</option>
          <option value="REPLIED">Đã phản hồi</option>
        </select>

        <select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)} aria-label="Lọc điểm">
          <option value="ALL">Tất cả điểm</option>
          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>{score}/10</option>)}
        </select>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquareReply size={30} />}
          title="Chưa có đánh giá phù hợp"
          description="Khi khách hoàn tất lưu trú và gửi đánh giá, nội dung sẽ xuất hiện tại đây."
        />
      ) : (
        <section className="review-management-list">
          {filtered.map((review) => {
            const hotel = hotelMap[String(review.hotelId)];
            const reply = replyText(review);
            const hidden = moderationStatus(review) === "HIDDEN";

            return (
              <article className={`review-management-card${hidden ? " is-hidden" : ""}`} key={review.id}>
                <header className="review-management-card-head">
                  <div className="review-management-author">
                    <span className="review-management-avatar">
                      <AvatarImage
                        source={review.customerAvatarUrl}
                        alt=""
                        fallback={String(review.customerName ?? "K").charAt(0).toUpperCase()}
                      />
                    </span>
                    <div>
                      <strong>{review.customerName ?? "Khách EnziuRooms"}</strong>
                      <small>{review.hotelName ?? hotel?.name ?? "Khách sạn của bạn"}</small>
                    </div>
                  </div>
                  <div className="review-management-head-right">
                    {hidden ? <StatusBadge label="Đã bị quản trị ẩn" tone="warning" /> : null}
                    {reply ? <StatusBadge label="Đã phản hồi" tone="success" icon={<CheckCircle2 size={14} />} dot={false} /> : <StatusBadge label="Chờ phản hồi" tone="info" />}
                    <strong className="review-management-score">{Number.isFinite(Number(review.rating)) ? Number(review.rating).toFixed(1) : "—"}</strong>
                  </div>
                </header>

                <div className="review-management-body">
                  <aside className="review-management-meta">
                    <p><strong>Ngày đánh giá</strong>{formatDate(review.createdAt)}</p>
                    <p><strong>Booking</strong>{review.bookingCode ?? review.bookingId ?? "Đã xác minh"}</p>
                    <p><strong>Lưu trú</strong>{review.checkIn && review.checkOut ? `${review.checkIn} → ${review.checkOut}` : "Đã hoàn tất"}</p>
                  </aside>
                  <div className="review-management-copy">
                    <h3>{review.title || "Trải nghiệm lưu trú"}</h3>
                    {review.positiveComment ? <div className="review-management-sentiment positive"><Smile size={20} /><span>{review.positiveComment}</span></div> : null}
                    {review.negativeComment ? <div className="review-management-sentiment negative"><Frown size={20} /><span>{review.negativeComment}</span></div> : null}
                    {Array.isArray(review.images) && review.images.length ? (
                      <div className="review-management-images">{review.images.slice(0, 6).map((src, index) => <img key={`${src}-${index}`} src={src} alt={`Ảnh đánh giá ${index + 1}`} />)}</div>
                    ) : null}
                  </div>
                </div>

                {hidden && review.hiddenReason ? (
                  <div className="review-hidden-reason"><strong>Lý do quản trị ẩn</strong>{review.hiddenReason}</div>
                ) : null}

                {reply ? (
                  <div className="review-management-reply">
                    <div className="review-management-reply-head">
                      <strong><Hotel size={16} /> Phản hồi từ khách sạn</strong>
                      <small>{formatDate(replyTime(review))}</small>
                    </div>
                    <p>{reply}</p>
                  </div>
                ) : null}

                {editingId === review.id ? (
                  <div className="review-management-composer">
                    <label>
                      {reply ? "Chỉnh sửa phản hồi" : "Phản hồi khách hàng"}
                      <textarea
                        autoFocus
                        maxLength={1500}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Cảm ơn bạn đã lựa chọn khách sạn. Chúng tôi rất mong được đón tiếp bạn trong lần tới..."
                      />
                    </label>
                    <div className="review-management-composer-footer">
                      <small>{draft.length}/1500 ký tự</small>
                      <div>
                        <button type="button" className="review-management-button" onClick={cancelReply} disabled={busyId === review.id}>Hủy</button>
                        <button type="button" className="review-management-button primary" onClick={() => void saveReply(review)} disabled={busyId === review.id || !draft.trim()}>{busyId === review.id ? "Đang lưu..." : "Gửi phản hồi"}</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <footer className="review-management-actions">
                    <button type="button" className="review-management-button primary" onClick={() => beginReply(review)} disabled={hidden || Boolean(busyId)}>
                      {reply ? <Edit3 size={16} /> : <MessageSquareReply size={16} />}
                      {reply ? "Sửa phản hồi" : "Phản hồi"}
                    </button>
                    {reply ? (
                      <button type="button" className="review-management-button danger" onClick={() => void removeReply(review)} disabled={hidden || Boolean(busyId)}><Trash2 size={16} /> Xóa phản hồi</button>
                    ) : null}
                  </footer>
                )}
              </article>
            );
          })}
        </section>
      )}

      <p className="review-management-footer-note">
        Khách sạn không thể sửa hoặc xóa nội dung đánh giá của khách. Đánh giá bị EnziuRooms ẩn sẽ không xuất hiện công khai.
      </p>
    </main>
  );
}
