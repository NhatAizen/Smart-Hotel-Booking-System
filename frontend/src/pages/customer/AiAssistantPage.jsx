import {
  BedDouble,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  MessageCircleQuestion,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  WalletCards,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import { askEnziuAssistant } from "../../services/aiService";
import { statusLabel } from "../../utils/presentation";
import "./AiAssistantPage.css";

const QUICK_PROMPTS = [
  "Tìm khách sạn cho 2 người, ưu tiên review tốt",
  "Booking sắp tới của tôi là khi nào?",
  "Tôi còn phải thanh toán bao nhiêu?",
  "QR check-in hoạt động như thế nào?",
];

function money(value) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("vi-VN")} ₫`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value) {
  if (!value) return "—";
  return String(value).slice(0, 5);
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hotelUrl(hotel, context) {
  const params = new URLSearchParams();
  if (context?.checkIn) params.set("checkIn", context.checkIn);
  if (context?.checkOut) params.set("checkOut", context.checkOut);
  if (context?.adults) params.set("guests", context.adults);
  params.set("rooms", "1");
  const query = params.toString();
  return `/hotels/${hotel.hotelId}${query ? `?${query}` : ""}`;
}

function HotelCard({ hotel, context }) {
  return (
    <article className={`enziu-ai-hotel-card ${hotel.exactMatch ? "exact" : "alternative"}`}>
      <div className="enziu-ai-hotel-image">
        {hotel.coverImageUrl ? (
          <img src={hotel.coverImageUrl} alt={hotel.name} />
        ) : (
          <div className="enziu-ai-image-fallback"><BedDouble size={28} /></div>
        )}
        {hotel.exactMatch ? <span className="enziu-ai-match-badge">Phù hợp</span> : null}
      </div>

      <div className="enziu-ai-hotel-body">
        <div className="enziu-ai-hotel-title-row">
          <div>
            <div className="enziu-ai-stars" aria-label={`${hotel.starRating ?? 0} sao`}>
              {Array.from({ length: Number(hotel.starRating ?? 0) }, (_, index) => (
                <Star size={12} fill="currentColor" key={index} />
              ))}
            </div>
            <h3>{hotel.name}</h3>
          </div>
          {hotel.averageRating ? (
            <div className="enziu-ai-rating">
              <strong>{Number(hotel.averageRating).toFixed(1)}</strong>
              <span>{hotel.reviewCount ?? 0} đánh giá</span>
            </div>
          ) : null}
        </div>

        <p className="enziu-ai-location">
          <MapPin size={14} />
          {hotel.city || hotel.address || "Chưa cập nhật địa chỉ"}
        </p>

        {hotel.roomTypeName ? (
          <div className="enziu-ai-room-line">
            <BedDouble size={15} />
            <div>
              <strong>{hotel.roomTypeName}</strong>
              <span>
                Tối đa {hotel.maxAdults ?? "—"} người lớn
                {Number(hotel.maxChildren ?? 0) > 0 ? ` · ${hotel.maxChildren} trẻ em` : ""}
              </span>
            </div>
          </div>
        ) : null}

        <div className="enziu-ai-hotel-meta">
          <span>
            {hotel.pricePerNight !== null && hotel.pricePerNight !== undefined
              ? <><strong>{money(hotel.pricePerNight)}</strong> / đêm</>
              : "Chưa có giá"}
          </span>
          {hotel.availabilityChecked ? (
            <span className={Number(hotel.availableRooms ?? 0) > 0 ? "available" : "sold"}>
              {Number(hotel.availableRooms ?? 0) > 0
                ? `Còn ${hotel.availableRooms} phòng`
                : "Không còn phòng theo ngày chọn"}
            </span>
          ) : (
            <span className="neutral">Chọn ngày để kiểm tra phòng trống</span>
          )}
        </div>

        {hotel.matchReasons?.length ? (
          <div className="enziu-ai-reasons">
            {hotel.matchReasons.slice(0, 3).map((reason) => (
              <span key={reason}><CheckCircle2 size={12} /> {reason}</span>
            ))}
          </div>
        ) : null}

        <div className="enziu-ai-hotel-actions">
          <Link to={hotelUrl(hotel, context)} className="secondary">Xem khách sạn</Link>
          <Link to={`${hotelUrl(hotel, context)}#rooms`} className="primary">
            Chọn phòng <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function BookingCard({ booking }) {
  return (
    <article className="enziu-ai-booking-card">
      <div className="enziu-ai-booking-cover">
        {booking.hotelCoverImageUrl ? (
          <img src={booking.hotelCoverImageUrl} alt={booking.hotelName} />
        ) : (
          <BedDouble size={24} />
        )}
      </div>

      <div className="enziu-ai-booking-content">
        <div className="enziu-ai-booking-heading">
          <div>
            <span>{booking.bookingCode}</span>
            <h3>{booking.hotelName}</h3>
          </div>
          <span className={`enziu-ai-booking-status ${String(booking.bookingStatus || "").toLowerCase()}`}>
            {statusLabel(booking.bookingStatus)}
          </span>
        </div>

        <p>{booking.roomTypeName || "Loại phòng"}</p>

        <div className="enziu-ai-booking-grid">
          <div><CalendarDays size={14} /><span>Nhận phòng<strong>{formatDate(booking.checkIn)}</strong></span></div>
          <div><CalendarDays size={14} /><span>Trả phòng<strong>{formatDate(booking.checkOut)}</strong></span></div>
          <div><Clock3 size={14} /><span>Giờ nhận / trả<strong>{formatTime(booking.hotelCheckInTime)} / {formatTime(booking.hotelCheckOutTime)}</strong></span></div>
          <div><CreditCard size={14} /><span>Thanh toán<strong>{statusLabel(booking.paymentStatus)}</strong></span></div>
        </div>

        <div className="enziu-ai-payment-row">
          <span>Tổng {money(booking.totalPrice)}</span>
          <span>Đã trả <strong>{money(booking.paidAmount)}</strong></span>
          <span>Còn lại <strong>{money(booking.remainingAmount)}</strong></span>
        </div>

        <Link to="/customer/bookings#booking-list" className="enziu-ai-booking-link">
          Xem đơn đặt phòng <ChevronRight size={14} />
        </Link>
      </div>
    </article>
  );
}

function AssistantMessage({ message }) {
  return (
    <div className="enziu-ai-assistant-message">
      <div className="enziu-ai-avatar"><Sparkles size={16} /></div>
      <div className="enziu-ai-message-content">
        <div className="enziu-ai-message-copy">{message.content}</div>

        {message.context?.availabilityChecked ? (
          <div className="enziu-ai-context-chip">
            <CalendarDays size={13} />
            {formatDate(message.context.checkIn)} → {formatDate(message.context.checkOut)}
            <span>·</span>
            <Users size={13} />
            {message.context.adults ?? 1} người lớn
            {Number(message.context.children ?? 0) > 0 ? ` · ${message.context.children} trẻ em` : ""}
          </div>
        ) : null}

        {message.hotels?.length ? (
          <div className={`enziu-ai-hotel-results ${message.hotels.length === 1 ? "single" : ""}`}>
            {message.hotels.map((hotel) => (
              <HotelCard hotel={hotel} context={message.context} key={hotel.hotelId} />
            ))}
          </div>
        ) : null}

        {message.bookings?.length ? (
          <div className="enziu-ai-booking-results">
            {message.bookings.map((booking) => (
              <BookingCard booking={booking} key={booking.bookingId} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  const [searchParams] = useSearchParams();
  const contextualHotelId = searchParams.get("hotelId");
  const [question, setQuestion] = useState("");
  const [trip, setTrip] = useState({
    checkIn: searchParams.get("checkIn") || "",
    checkOut: searchParams.get("checkOut") || "",
    adults: Number(searchParams.get("adults") || searchParams.get("guests") || 2),
    children: Number(searchParams.get("children") || 0),
  });
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Chào bạn, mình là Enziu AI. Mình có thể giúp tìm và so sánh khách sạn, tóm tắt đánh giá hoặc tra cứu booking của bạn. Bạn muốn bắt đầu với điều gì?",
      hotels: [],
      bookings: [],
      suggestedPrompts: QUICK_PROMPTS,
    },
  ]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const today = useMemo(() => localDateValue(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const latestSuggestions = useMemo(() => {
    const latestAssistant = [...messages].reverse().find((item) => item.role === "assistant");
    return latestAssistant?.suggestedPrompts?.length
      ? latestAssistant.suggestedPrompts
      : QUICK_PROMPTS;
  }, [messages]);

  async function sendQuestion(rawQuestion) {
    const currentQuestion = String(rawQuestion ?? question).trim();
    if (!currentQuestion || sending) return;

    const history = messages
      .slice(-6)
      .map((item) => ({ role: item.role, content: item.content }));

    setMessages((current) => [
      ...current,
      { role: "user", content: currentQuestion },
    ]);
    setQuestion("");
    setSending(true);
    setError("");

    try {
      const response = await askEnziuAssistant({
        message: currentQuestion,
        checkIn: trip.checkIn || null,
        checkOut: trip.checkOut || null,
        adults: Number(trip.adults) || 1,
        children: Number(trip.children) || 0,
        hotelId: contextualHotelId || null,
        history,
      });

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.answer || "Mình chưa nhận được nội dung trả lời.",
          hotels: response.hotels ?? [],
          bookings: response.bookings ?? [],
          context: response.context ?? null,
          intent: response.intent,
          suggestedPrompts: response.suggestedPrompts ?? [],
        },
      ]);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.response?.data?.error
          ?? "Không thể kết nối Enziu AI. Hãy kiểm tra AI Service và Gemini API.",
      );
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    void sendQuestion(question);
  }

  function updateTrip(field, value) {
    setTrip((current) => ({ ...current, [field]: value }));
  }

  return (
    <main className="enziu-ai-page">
      <div className="container enziu-ai-shell">
        <section className="enziu-ai-hero">
          <div>
            <span className="enziu-ai-eyebrow"><WandSparkles size={15} /> ENZIU AI</span>
            <h1>Trợ lý du lịch EnziuRooms</h1>
            <p>
              Tìm khách sạn, so sánh lựa chọn, đọc review thật và hỏi về booking của chính bạn trong một cuộc trò chuyện.
            </p>
          </div>
          <div className="enziu-ai-grounded-badge">
            <ShieldCheck size={19} />
            <div><strong>Grounded AI</strong><span>Hotel · Room · Booking · Review</span></div>
          </div>
        </section>

        <ErrorMessage message={error} />

        <section className="enziu-ai-workspace">
          <aside className="enziu-ai-sidebar">
            <div className="enziu-ai-sidebar-title">
              <CalendarDays size={18} />
              <div><strong>Chuyến đi của bạn</strong><span>Giúp AI kiểm tra phòng trống chính xác</span></div>
            </div>

            <label>
              <span>Nhận phòng</span>
              <input
                type="date"
                min={today}
                value={trip.checkIn}
                onChange={(event) => updateTrip("checkIn", event.target.value)}
              />
            </label>
            <label>
              <span>Trả phòng</span>
              <input
                type="date"
                min={trip.checkIn || today}
                value={trip.checkOut}
                onChange={(event) => updateTrip("checkOut", event.target.value)}
              />
            </label>

            <div className="enziu-ai-guest-fields">
              <label>
                <span>Người lớn</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={trip.adults}
                  onChange={(event) => updateTrip("adults", event.target.value)}
                />
              </label>
              <label>
                <span>Trẻ em</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={trip.children}
                  onChange={(event) => updateTrip("children", event.target.value)}
                />
              </label>
            </div>

            <div className="enziu-ai-sidebar-note">
              <Sparkles size={15} />
              <p>
                Bạn vẫn có thể hỏi khi chưa chọn ngày. Kết quả <strong>còn phòng</strong> sẽ chính xác hơn khi có đủ ngày nhận và trả phòng.
              </p>
            </div>

            <div className="enziu-ai-capabilities">
              <span><MapPin size={14} /> Tìm & so sánh khách sạn</span>
              <span><MessageCircleQuestion size={14} /> Tóm tắt review thật</span>
              <span><WalletCards size={14} /> Booking & thanh toán của tôi</span>
              <span><ShieldCheck size={14} /> Chính sách & QR check-in</span>
            </div>
          </aside>

          <section className="enziu-ai-chat-card">
            <header className="enziu-ai-chat-header">
              <div className="enziu-ai-bot-mark"><Bot size={23} /></div>
              <div>
                <strong>Enziu AI Assistant</strong>
                <span><i /> Đang chuẩn bị thông tin</span>
              </div>
            </header>

            <div className="enziu-ai-messages">
              {messages.map((message, index) => (
                message.role === "assistant" ? (
                  <AssistantMessage message={message} key={`assistant-${index}`} />
                ) : (
                  <div className="enziu-ai-user-message" key={`user-${index}`}>
                    <div>{message.content}</div>
                  </div>
                )
              ))}

              {sending ? (
                <div className="enziu-ai-thinking">
                  <div className="enziu-ai-avatar"><Sparkles size={16} /></div>
                  <div><span /><span /><span /> <em>Enziu AI đang tìm thông tin phù hợp...</em></div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <div className="enziu-ai-suggestions">
              {latestSuggestions.slice(0, 4).map((prompt) => (
                <button type="button" onClick={() => void sendQuestion(prompt)} key={prompt} disabled={sending}>
                  {prompt}
                </button>
              ))}
            </div>

            <form className="enziu-ai-composer" onSubmit={handleSubmit}>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendQuestion(question);
                  }
                }}
                placeholder="Ví dụ: Tìm khách sạn ở Đà Lạt dưới 1.500.000đ/đêm, có hồ bơi và review tốt..."
                rows="2"
                maxLength="2000"
              />
              <button type="submit" disabled={sending || !question.trim()}>
                <Send size={18} />
                <span>Gửi</span>
              </button>
            </form>
            <p className="enziu-ai-disclaimer">
              Enziu AI hỗ trợ tư vấn; các thao tác thanh toán, hủy phòng và check-in vẫn cần bạn xác nhận.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
