import {
  BedDouble,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CreditCard,
  Image as ImageIcon,
  MapPin,
  MessageCirclePlus,
  Minus,
  Scale,
  Send,
  ShieldCheck,
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
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${Math.round(numeric).toLocaleString("vi-VN")} ₫`;
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

function roomTypeUrl(roomType) {
  const params = new URLSearchParams();

  if (roomType?.checkIn) params.set("checkIn", roomType.checkIn);
  if (roomType?.checkOut) params.set("checkOut", roomType.checkOut);
  if (roomType?.adults) params.set("guests", roomType.adults);
  if (Number(roomType?.children ?? 0) > 0) {
    params.set("children", roomType.children);
  }
  params.set("rooms", "1");

  const query = params.toString();
  return `/hotels/${roomType.hotelId}${query ? `?${query}` : ""}#rooms`;
}

function RoomTypeResultCard({ roomType, onNavigate }) {
  const images = Array.isArray(roomType?.imageUrls)
    ? roomType.imageUrls.filter(Boolean)
    : [];

  const displayPrice =
    roomType?.finalPayableAmount ??
    roomType?.totalStayAmount ??
    roomType?.basePrice ??
    null;

  const hasDiscount =
    roomType?.finalPayableAmount !== null &&
    roomType?.finalPayableAmount !== undefined &&
    Number(roomType?.totalDiscount ?? 0) > 0;

  return (
    <article className="enziu-fai-room-card">
      <div className="enziu-fai-room-card-image">
        {images[0] ? (
          <img src={images[0]} alt={`Phòng ${roomType.name}`} />
        ) : (
          <div className="enziu-fai-room-card-placeholder">
            <ImageIcon size={24} />
            <span>Chưa có ảnh loại phòng</span>
          </div>
        )}

        <span className="enziu-fai-room-card-label">
          <BedDouble size={11} /> Loại phòng
        </span>
      </div>

      {images.length > 1 ? (
        <div className="enziu-fai-room-thumbs">
          {images.slice(1, 4).map((image, index) => (
            <img
              src={image}
              alt={`${roomType.name} ${index + 2}`}
              key={`${image}-${index}`}
            />
          ))}
          {images.length > 4 ? (
            <span>+{images.length - 4} ảnh</span>
          ) : null}
        </div>
      ) : null}

      <div className="enziu-fai-room-card-body">
        <div className="enziu-fai-room-card-heading">
          <div>
            <small>{roomType.hotelName || "Khách sạn"}</small>
            <strong>{roomType.name}</strong>
          </div>

          {roomType.availabilityChecked ? (
            <span
              className={
                Number(roomType.availableRooms ?? 0) > 0
                  ? "available"
                  : "sold-out"
              }
            >
              {Number(roomType.availableRooms ?? 0) > 0
                ? `Còn ${roomType.availableRooms} phòng`
                : "Hết phòng"}
            </span>
          ) : null}
        </div>

        <div className="enziu-fai-room-facts">
          {Number(roomType.maxAdults ?? 0) > 0 ? (
            <span>
              <Users size={11} /> {roomType.maxAdults} người lớn
              {Number(roomType.maxChildren ?? 0) > 0
                ? ` + ${roomType.maxChildren} trẻ em`
                : ""}
            </span>
          ) : null}

          {Number(roomType.bedCount ?? 0) > 0 || roomType.bedType ? (
            <span>
              <BedDouble size={11} />
              {[roomType.bedCount || null, roomType.bedType || "giường"]
                .filter(Boolean)
                .join(" ")}
            </span>
          ) : null}

          {Number(roomType.areaSqm ?? 0) > 0 ? (
            <span>{roomType.areaSqm} m²</span>
          ) : null}
        </div>

        {displayPrice !== null && displayPrice !== undefined ? (
          <div className="enziu-fai-room-price">
            <span>
              {roomType.finalPayableAmount !== null &&
              roomType.finalPayableAmount !== undefined
                ? "Giá theo ngày đã chọn"
                : "Giá niêm yết"}
            </span>
            <div>
              {hasDiscount && roomType.totalStayAmount !== null &&
              roomType.totalStayAmount !== undefined ? (
                <del>{money(roomType.totalStayAmount)}</del>
              ) : null}
              <strong>{money(displayPrice)}</strong>
            </div>
          </div>
        ) : null}

        {Array.isArray(roomType.amenities) && roomType.amenities.length ? (
          <div className="enziu-fai-room-amenities">
            {roomType.amenities.slice(0, 4).map((amenity) => (
              <span key={amenity}>{amenity}</span>
            ))}
          </div>
        ) : null}

        <Link
          className="enziu-fai-room-open"
          to={roomTypeUrl(roomType)}
          onClick={onNavigate}
        >
          Xem loại phòng <ChevronRight size={13} />
        </Link>
      </div>
    </article>
  );
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
        <div className="enziu-fai-hotel-badges">
          {hotel.copilotRank ? (
            <span className="rank">#{hotel.copilotRank}</span>
          ) : null}
          {hotel.matchPercent !== null && hotel.matchPercent !== undefined ? (
            <span className="match">
              <Sparkles size={11} /> {hotel.matchPercent}% phù hợp
            </span>
          ) : hotel.exactMatch ? (
            <span className="match"><CheckCircle2 size={11} /> Phù hợp</span>
          ) : null}
        </div>
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
              {Number(hotel.reviewCount ?? 0) > 0 ? (
                <small>{hotel.reviewCount} đánh giá</small>
              ) : null}
            </span>
          ) : null}
        </div>

        <p className="enziu-fai-location">
          <MapPin size={12} />
          {hotel.locationLabel || hotel.address || hotel.city || "Chưa cập nhật địa chỉ"}
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
          {hotel.discountChecked && hotel.finalPayableAmount !== null && hotel.finalPayableAmount !== undefined ? (
            <div className="enziu-fai-discount-price">
              <span>
                {Number(hotel.totalDiscount ?? 0) > 0
                  ? "Giá tốt nhất có thể áp dụng"
                  : "Giá sau quyền lợi thành viên"}
              </span>
              <div>
                {Number(hotel.totalDiscount ?? 0) > 0 && hotel.totalStayAmount !== null && hotel.totalStayAmount !== undefined ? (
                  <del>{money(hotel.totalStayAmount)}</del>
                ) : null}
                <strong>{money(hotel.finalPayableAmount)}</strong>
              </div>
              {Number(hotel.totalDiscount ?? 0) > 0 ? (
                <small>
                  Tiết kiệm {money(hotel.totalDiscount)}
                  {hotel.membershipName ? ` · ${hotel.membershipName}` : ""}
                </small>
              ) : hotel.membershipName ? (
                <small>{hotel.membershipName} · giảm {Number(hotel.membershipPercent ?? 0)}%</small>
              ) : null}
              {(hotel.hotelPromotionCode || hotel.platformPromotionCode) ? (
                <small className="promo-code">
                  Mã hợp lệ: {[hotel.hotelPromotionCode, hotel.platformPromotionCode].filter(Boolean).join(" + ")}
                </small>
              ) : null}
            </div>
          ) : hotel.pricingChecked && hotel.totalStayAmount !== null && hotel.totalStayAmount !== undefined ? (
            <div className="enziu-fai-discount-price pending">
              <span>Tổng trước ưu đãi</span>
              <div><strong>{money(hotel.totalStayAmount)}</strong></div>
              <small>Chưa xác nhận được ưu đãi</small>
            </div>
          ) : (
            <span>
              {hotel.pricePerNight !== null && hotel.pricePerNight !== undefined
                ? <><strong>{money(hotel.pricePerNight)}</strong>/đêm</>
                : "Chưa có giá"}
            </span>
          )}

          <span className={hotel.availabilityChecked ? "checked" : "neutral"}>
            {hotel.availabilityChecked
              ? Number(hotel.availableRooms ?? 0) > 0
                ? `Còn ${hotel.availableRooms} phòng`
                : "Hết phòng theo ngày chọn"
              : "Chọn ngày để kiểm tra phòng & ưu đãi"}
          </span>
        </div>

        {(hotel.copilotReasons?.length || hotel.matchReasons?.length) ? (
          <div className="enziu-fai-reasons">
            {(hotel.copilotReasons?.length
              ? hotel.copilotReasons
              : hotel.matchReasons
            ).slice(0, 4).map((reason) => (
              <span key={reason}><CheckCircle2 size={9} /> {reason}</span>
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

function AssistantMessage({ message, onNavigate, onOpenTrip, onAsk }) {
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

        {message.copilot?.roomCards?.length ? (
          <div className="enziu-fai-results">
            {message.copilot.roomCards.map((roomType) => (
              <RoomTypeResultCard
                roomType={roomType}
                onNavigate={onNavigate}
                key={roomType.id ?? roomType.name}
              />
            ))}
          </div>
        ) : null}

        {message.copilot?.criteria?.length ? (
          <div className="enziu-fai-understood">
            <strong><Sparkles size={12} /> AI đã hiểu</strong>
            <div>
              {message.copilot.criteria.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
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

        {message.hotels?.length && !message.copilot?.availabilityChecked ? (
          <button
            type="button"
            className="enziu-fai-followup"
            onClick={onOpenTrip}
          >
            <CalendarDays size={13} />
            Thêm ngày để AI kiểm tra phòng trống chính xác
          </button>
        ) : null}

        {message.hotels?.length >= 2 ? (
          <button
            type="button"
            className="enziu-fai-compare"
            onClick={() =>
              onAsk?.(
                `So sánh ${message.hotels[0].name} và ${message.hotels[1].name} theo nhu cầu tôi vừa hỏi.`,
              )
            }
          >
            <Scale size={13} />
            So sánh Top 2 bằng AI
          </button>
        ) : null}

        {message.copilot?.methodology ? (
          <div className="enziu-fai-methodology">
            <ShieldCheck size={12} />
            <span>{message.copilot.methodology}</span>
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
    latestUserQuestion,
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
                <strong>Enziu AI Copilot</strong>
                <span><i /> Tìm · so sánh · kiểm tra phòng thật</span>
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

          <div className="enziu-fai-grounding">
            <ShieldCheck size={12} />
            <span>Dữ liệu thật từ Hotel · Room · Availability · Pricing · Ưu đãi · Review</span>
          </div>

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
                Chuyến đi để kiểm tra giá & phòng
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

                {trip.checkIn && trip.checkOut ? (
                  <div className="enziu-fai-trip-applied">
                    <div>
                      <CheckCircle2 size={13} />
                      <span>
                        Đang áp dụng <strong>{formatDate(trip.checkIn)} → {formatDate(trip.checkOut)}</strong>
                        {` · ${Number(trip.adults) || 1} người lớn`}
                        {Number(trip.children) > 0 ? ` · ${trip.children} trẻ em` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() =>
                        void sendQuestion(
                          latestUserQuestion
                            || "Kiểm tra lại giá, phòng trống và ưu đãi với ngày tôi vừa chọn.",
                        )
                      }
                    >
                      <Sparkles size={12} />
                      Kiểm tra với ngày đã chọn
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="enziu-fai-messages">
            {messages.map((message, index) => (
              message.role === "assistant" ? (
                <AssistantMessage
                  message={message}
                  onNavigate={handleNavigate}
                  onOpenTrip={() => {
                    setTripOpen(true);
                  }}
                  onAsk={(prompt) => void sendQuestion(prompt)}
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
                <div><span /><span /><span /><em>Đang đối chiếu dữ liệu EnziuRooms...</em></div>
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
              placeholder="VD: Tôi có 2 triệu, muốn ở Quận 1, có hồ bơi và review tốt..."
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
            Gemini hiểu và giải thích; giá, phòng trống và booking do dữ liệu EnziuRooms quyết định.
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