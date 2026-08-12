import {
  BedDouble,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  MessageCirclePlus,
  Minus,
  Send,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Link,
  useLocation,
} from "react-router-dom";

import { useAiAssistant } from "../../ai/AiAssistantContext";
import { useAuth } from "../../auth/AuthContext";
import "./FloatingAiAssistant.css";

const STATUS_LABEL = {
  PENDING: "Chờ xử lý",
  PENDING_PAYMENT: "Chờ thanh toán",
  CONFIRMED: "Đã xác nhận",
  CHECKED_IN: "Đang lưu trú",
  CHECKED_OUT: "Đã trả phòng",
  CANCELLED: "Đã hủy",
};

const PAYMENT_LABEL = {
  UNPAID: "Chưa thanh toán",
  PARTIALLY_PAID: "Đã đặt cọc",
  PAID: "Đã thanh toán",
  REFUNDED: "Đã hoàn tiền",
  FAILED: "Thanh toán lỗi",
};

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

function hotelUrl(hotel, context) {
  const params = new URLSearchParams();
  if (context?.checkIn) params.set("checkIn", context.checkIn);
  if (context?.checkOut) params.set("checkOut", context.checkOut);
  if (context?.adults) params.set("guests", context.adults);
  params.set("rooms", "1");

  const query = params.toString();
  return `/hotels/${hotel.hotelId}${query ? `?${query}` : ""}`;
}

function HotelResultCard({ hotel, context, onNavigate }) {
  return (
    <article className="enziu-fai-hotel-card">
      <div className="enziu-fai-hotel-image">
        {hotel.coverImageUrl ? (
          <img src={hotel.coverImageUrl} alt={hotel.name} />
        ) : (
          <BedDouble size={24} />
        )}
        {hotel.exactMatch ? (
          <span><CheckCircle2 size={11} /> Phù hợp</span>
        ) : null}
      </div>

      <div className="enziu-fai-hotel-body">
        <div className="enziu-fai-hotel-title">
          <div>
            <div className="enziu-fai-stars">
              {Array.from(
                { length: Math.min(Number(hotel.starRating ?? 0), 5) },
                (_, index) => (
                  <Star size={10} fill="currentColor" key={index} />
                ),
              )}
            </div>
            <strong>{hotel.name}</strong>
          </div>
          {hotel.averageRating ? (
            <span className="enziu-fai-rating">
              {Number(hotel.averageRating).toFixed(1)}
            </span>
          ) : null}
        </div>

        <p className="enziu-fai-location">
          <MapPin size={12} />
          {hotel.city || hotel.address || "Chưa cập nhật địa chỉ"}
        </p>

        {hotel.roomTypeName ? (
          <p className="enziu-fai-room-type">
            <BedDouble size={12} />
            <span>
              <strong>{hotel.roomTypeName}</strong>
              {hotel.maxAdults ? ` · tối đa ${hotel.maxAdults} người lớn` : ""}
            </span>
          </p>
        ) : null}

        <div className="enziu-fai-hotel-meta">
          <span>
            {hotel.pricePerNight !== null && hotel.pricePerNight !== undefined
              ? <><strong>{money(hotel.pricePerNight)}</strong>/đêm</>
              : "Chưa có giá"}
          </span>
          <span className={hotel.availabilityChecked ? "checked" : "neutral"}>
            {hotel.availabilityChecked
              ? Number(hotel.availableRooms ?? 0) > 0
                ? `Còn ${hotel.availableRooms} phòng`
                : "Hết phòng theo ngày chọn"
              : "Chọn ngày để kiểm tra phòng"}
          </span>
        </div>

        {hotel.matchReasons?.length ? (
          <div className="enziu-fai-reasons">
            {hotel.matchReasons.slice(0, 2).map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        ) : null}

        <div className="enziu-fai-card-actions">
          <Link to={hotelUrl(hotel, context)} onClick={onNavigate}>
            Xem khách sạn
          </Link>
          <Link
            className="primary"
            to={`${hotelUrl(hotel, context)}#rooms`}
            onClick={onNavigate}
          >
            Chọn phòng <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function BookingResultCard({ booking, onNavigate }) {
  return (
    <article className="enziu-fai-booking-card">
      <div className="enziu-fai-booking-heading">
        <div>
          <span>{booking.bookingCode}</span>
          <strong>{booking.hotelName}</strong>
        </div>
        <em>{STATUS_LABEL[booking.bookingStatus] ?? booking.bookingStatus}</em>
      </div>

      <p>{booking.roomTypeName || "Loại phòng"}</p>

      <div className="enziu-fai-booking-grid">
        <span><CalendarDays size={12} /> {formatDate(booking.checkIn)}</span>
        <span><CalendarDays size={12} /> {formatDate(booking.checkOut)}</span>
        <span><Clock3 size={12} /> {formatTime(booking.hotelCheckInTime)} / {formatTime(booking.hotelCheckOutTime)}</span>
        <span><CreditCard size={12} /> {PAYMENT_LABEL[booking.paymentStatus] ?? booking.paymentStatus}</span>
      </div>

      <div className="enziu-fai-payment-row">
        <span>Tổng <strong>{money(booking.totalPrice)}</strong></span>
        <span>Còn <strong>{money(booking.remainingAmount)}</strong></span>
      </div>

      <Link to="/customer/bookings#booking-list" onClick={onNavigate}>
        Xem đơn đặt phòng <ChevronRight size={13} />
      </Link>
    </article>
  );
}

function AssistantMessage({ message, onNavigate }) {
  return (
    <div className="enziu-fai-assistant-message">
      <div className="enziu-fai-avatar">
        <Sparkles size={14} />
      </div>

      <div className="enziu-fai-message-body">
        <div className="enziu-fai-message-copy">{message.content}</div>

        {message.context?.availabilityChecked ? (
          <div className="enziu-fai-context-chip">
            <CalendarDays size={11} />
            {formatDate(message.context.checkIn)} → {formatDate(message.context.checkOut)}
            <span>·</span>
            <Users size={11} />
            {message.context.adults ?? 1} người lớn
          </div>
        ) : null}

        {message.hotels?.length ? (
          <div className="enziu-fai-results">
            {message.hotels.map((hotel) => (
              <HotelResultCard
                hotel={hotel}
                context={message.context}
                onNavigate={onNavigate}
                key={hotel.hotelId}
              />
            ))}
          </div>
        ) : null}

        {message.bookings?.length ? (
          <div className="enziu-fai-results">
            {message.bookings.map((booking) => (
              <BookingResultCard
                booking={booking}
                onNavigate={onNavigate}
                key={booking.bookingId}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function FloatingAiAssistant() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const {
    isOpen,
    tripOpen,
    setTripOpen,
    question,
    setQuestion,
    trip,
    updateTrip,
    contextualHotel,
    messages,
    sending,
    error,
    latestSuggestions,
    closeAssistant,
    toggleAssistant,
    clearHotelContext,
    resetConversation,
    sendQuestion,
  } = useAiAssistant();

  const bottomRef = useRef(null);

  const normalizedRole = String(user?.role ?? "")
    .replace(/^ROLE_/i, "")
    .trim()
    .toUpperCase();

  const isCustomer = isAuthenticated && normalizedRole === "CUSTOMER";

  const hiddenForFlow = useMemo(
    () => [
      "/customer/checkout",
      "/customer/payment",
      "/customer/booking-success",
      "/payment/payos/",
    ].some((prefix) => location.pathname.startsWith(prefix)),
    [location.pathname],
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (!isOpen) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isOpen, messages, sending]);

  if (!isCustomer || hiddenForFlow) {
    return null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    void sendQuestion(question);
  }

  function handleNavigate() {
    closeAssistant();
  }

  return (
    <div className="enziu-fai-root">
      {isOpen ? (
        <section
          className="enziu-fai-panel"
          aria-label="Enziu AI Assistant"
        >
          <header className="enziu-fai-header">
            <div className="enziu-fai-brand">
              <span className="enziu-fai-bot-mark"><Bot size={20} /></span>
              <div>
                <strong>Enziu AI</strong>
                <span><i /> Trợ lý khách sạn</span>
              </div>
            </div>

            <div className="enziu-fai-header-actions">
              <button
                type="button"
                onClick={resetConversation}
                title="Cuộc trò chuyện mới"
                aria-label="Cuộc trò chuyện mới"
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                onClick={closeAssistant}
                title="Thu nhỏ"
                aria-label="Thu nhỏ chatbot"
              >
                <Minus size={17} />
              </button>
            </div>
          </header>

          {contextualHotel ? (
            <div className="enziu-fai-hotel-context">
              <div>
                <Bot size={14} />
                <span>Đang hỏi về <strong>{contextualHotel.name}</strong></span>
              </div>
              <button
                type="button"
                onClick={clearHotelContext}
                aria-label="Bỏ khách sạn khỏi context AI"
              >
                <X size={14} />
              </button>
            </div>
          ) : null}

          <div className={`enziu-fai-trip ${tripOpen ? "open" : ""}`}>
            <button
              type="button"
              className="enziu-fai-trip-toggle"
              onClick={() => setTripOpen((current) => !current)}
            >
              <span>
                <CalendarDays size={14} />
                Chuyến đi
                {trip.checkIn && trip.checkOut ? (
                  <em>{formatDate(trip.checkIn)} → {formatDate(trip.checkOut)}</em>
                ) : (
                  <em>Thêm ngày để kiểm tra phòng</em>
                )}
              </span>
              <ChevronDown size={15} />
            </button>

            {tripOpen ? (
              <div className="enziu-fai-trip-fields">
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
            ) : null}
          </div>

          <div className="enziu-fai-messages">
            {messages.map((message, index) => (
              message.role === "assistant" ? (
                <AssistantMessage
                  message={message}
                  onNavigate={handleNavigate}
                  key={`assistant-${index}`}
                />
              ) : (
                <div className="enziu-fai-user-message" key={`user-${index}`}>
                  <div>{message.content}</div>
                </div>
              )
            ))}

            {sending ? (
              <div className="enziu-fai-thinking">
                <div className="enziu-fai-avatar"><Sparkles size={14} /></div>
                <div><span /><span /><span /><em>Đang kiểm tra dữ liệu EnziuRooms...</em></div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          {error ? (
            <div className="enziu-fai-error">{error}</div>
          ) : null}

          <div className="enziu-fai-suggestions">
            {latestSuggestions.slice(0, 3).map((prompt) => (
              <button
                type="button"
                onClick={() => void sendQuestion(prompt)}
                disabled={sending}
                key={prompt}
              >
                {prompt}
              </button>
            ))}
          </div>

          <form className="enziu-fai-composer" onSubmit={handleSubmit}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendQuestion(question);
                }
              }}
              placeholder="Hỏi Enziu AI về khách sạn, review, booking..."
              rows="1"
              maxLength="2000"
            />
            <button
              type="submit"
              disabled={sending || !question.trim()}
              aria-label="Gửi câu hỏi"
            >
              <Send size={17} />
            </button>
          </form>

          <p className="enziu-fai-disclaimer">
            AI chỉ tư vấn, không tự thanh toán, hủy hay check-in thay bạn.
          </p>
        </section>
      ) : null}

      <button
        type="button"
        className={`enziu-fai-launcher ${isOpen ? "open" : ""}`}
        onClick={toggleAssistant}
        aria-label={isOpen ? "Đóng Enziu AI" : "Mở Enziu AI"}
      >
        {isOpen ? <X size={23} /> : <Bot size={24} />}
        {!isOpen ? <span>Hỏi Enziu AI</span> : null}
        {!isOpen ? <i><MessageCirclePlus size={12} /></i> : null}
      </button>
    </div>
  );
}
