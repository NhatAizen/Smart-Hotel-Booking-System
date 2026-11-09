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
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Plus,
  Users,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Link,
  useLocation,
} from "react-router-dom";

import { useAiAssistant } from "../../ai/AiAssistantContext";
import { useAuth } from "../../auth/AuthContext";
import { statusLabel } from "../../utils/presentation";
import { guestSummary, hasLocalEngineMetadata, assistantMapRoute } from "../../ai/assistantPresentation";
import { HotelMapModal } from "../map/HotelMiniMap";
import { resolveMediaUrl } from "../../utils/avatar";
import "./FloatingAiAssistant.css";

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
  if (Number(context?.children) > 0) params.set("children", context.children);
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

function RoomTypeResultCard({ roomType, onNavigate, recommended }) {
  const images = Array.isArray(roomType?.imageUrls)
    ? roomType.imageUrls.map(resolveMediaUrl).filter(Boolean)
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
    <article className={`enziu-fai-room-card ${recommended ? "is-recommended" : ""}`}>
      <div className="enziu-fai-room-card-image">
        {images[0] ? (
          <img src={images[0]} alt={`Phòng ${roomType.name}`} />
        ) : (
          <div className="enziu-fai-room-card-placeholder">
            <ImageIcon size={24} />

          </div>
        )}

        <span className="enziu-fai-room-card-label">
          <BedDouble size={11} /> {recommended ? "Đề xuất cho bạn" : "Lựa chọn khác"}
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
  const coverImage = resolveMediaUrl(hotel.coverImageUrl);
  const [failedImage, setFailedImage] = useState(null);
  return (
    <article className="enziu-fai-hotel-card" aria-label={`Khách sạn: ${hotel.name}`}>
      <div className="enziu-fai-hotel-overview">
        <div className="enziu-fai-hotel-image">
          {coverImage && failedImage !== coverImage ? (
            <img src={coverImage} alt={`Ảnh ${hotel.name}`} width="88" height="88" loading="lazy" decoding="async" onError={() => setFailedImage(coverImage)} />
          ) : (
            <span className="enziu-fai-image-placeholder"><BedDouble size={24} aria-hidden="true" /><small>Chưa có ảnh</small></span>
          )}
        </div>
        <div className="enziu-fai-hotel-identity">
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
              <h3><Link to={hotelUrl(hotel, context)} onClick={onNavigate}>{hotel.name}</Link></h3>
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
        </div>
      </div>

      <div className="enziu-fai-hotel-body">
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
              {Number(hotel.maxChildren) > 0 ? ` và ${hotel.maxChildren} trẻ em` : ""}
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
        <em>{statusLabel(booking.bookingStatus)}</em>
      </div>

      <p>{booking.roomTypeName || "Loại phòng"}</p>

      <div className="enziu-fai-booking-grid">
        <span><CalendarDays size={12} /> {formatDate(booking.checkIn)}</span>
        <span><CalendarDays size={12} /> {formatDate(booking.checkOut)}</span>
        <span><Clock3 size={12} /> {formatTime(booking.hotelCheckInTime)} / {formatTime(booking.hotelCheckOutTime)}</span>
        <span><CreditCard size={12} /> {statusLabel(booking.paymentStatus)}</span>
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

function HotelComparisonTable({ comparison, hotels, context, onNavigate }) {
  if (!comparison?.rows?.length || !hotels?.length) return null;
  return (
    <section className="enziu-fai-comparison" aria-label={`So sánh ${hotels.length} khách sạn`}>
      {comparison.note ? <p className="enziu-fai-comparison-note">{comparison.note}</p> : null}
      <p className="enziu-fai-comparison-hint">Cuộn ngang để xem đầy đủ các khách sạn.</p>
      <div className="enziu-fai-comparison-scroll" role="region" aria-label="Bảng đối chiếu khách sạn" tabIndex={0}>
        <table>
          <caption>So sánh {hotels.length} khách sạn{comparison.focus === "QUALITY" ? " về chất lượng" : ""}</caption>
          <thead><tr><th scope="col">Tiêu chí</th>{hotels.map(hotel => <th scope="col" key={hotel.hotelId}><Link to={hotelUrl(hotel, context)} onClick={onNavigate}>{hotel.name}</Link></th>)}</tr></thead>
          <tbody>{comparison.rows.filter(row => row.values?.length === hotels.length).map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value,index) => <td key={hotels[index].hotelId}>{value}</td>)}</tr>)}</tbody>
          <tfoot><tr><th scope="row">Chi tiết</th>{hotels.map(hotel => <td key={hotel.hotelId}><Link to={`${hotelUrl(hotel, context)}#rooms`} onClick={onNavigate}>Xem phòng</Link></td>)}</tr></tfoot>
        </table>
      </div>
    </section>
  );
}

function AssistantMessage({ message, onNavigate, onOpenTrip, onOpenMap, messageRef }) {
  const routeLandmark=message.directions?.landmark ?? message.directions?.origin;
  return (
    <div className="enziu-fai-assistant-message" ref={messageRef}>
      <div className="enziu-fai-avatar">
        <Sparkles size={14} />
      </div>

      <div className="enziu-fai-message-body">
        <div className="enziu-fai-message-copy">{message.content}</div>
        {message.directions ? (
          <section className="enziu-fai-directions" aria-label="Chỉ đường">
            {routeLandmark ? <div className="enziu-fai-route-origin">
              {message.directions.coordinatesOnly ? "Địa điểm: " : message.directions.hotelAtOrigin ? "Điểm đến: " : "Xuất phát: "}{routeLandmark.displayName ?? routeLandmark.query}
              {routeLandmark.sourceUrl?.startsWith("https://www.openstreetmap.org/") ? <a href={routeLandmark.sourceUrl} target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> : null}
            </div> : null}
            {(message.directions.destinations ?? []).map(destination => (
              <article className="enziu-fai-route-card" key={destination.hotelId}>
                {message.directions.hotelAtOrigin ? <small>Xuất phát</small> : null}
                <strong>{destination.name}</strong>
                <p>{destination.address || "Chưa có địa chỉ được công bố."}</p>
                {!message.directions.coordinatesOnly && assistantMapRoute(message.directions,destination) ? <button type="button" onClick={()=>onOpenMap(assistantMapRoute(message.directions,destination))}>Xem đường đi trên bản đồ</button> : null}
              </article>
            ))}
          </section>
        ) : null}
        {message.context?.nearby?.sourceUrl?.startsWith("https://www.openstreetmap.org/") ? (
          <a className="enziu-fai-followup" href={message.context.nearby.sourceUrl} target="_blank" rel="noopener noreferrer">
            Vị trí: {message.context.nearby.displayName} · © OpenStreetMap contributors
          </a>
        ) : null}
        <HotelComparisonTable comparison={message.comparison} hotels={message.hotels} context={message.context} onNavigate={onNavigate} />

        {(message.rooms?.length || message.copilot?.roomCards?.length) ? (
          <div className="enziu-fai-results">
            {(message.rooms?.length ? message.rooms : message.copilot.roomCards).map((roomType, index) => (
              <RoomTypeResultCard
                roomType={roomType}
                recommended={index === 0}
                onNavigate={onNavigate}
                key={roomType.id ?? roomType.name}
              />
            ))}
          </div>
        ) : null}

        {message.hotels?.length && !message.comparison?.rows?.length ? (
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

        {message.hotels?.length && !message.copilot?.availabilityChecked && !message.context?.availabilityChecked ? (
          <button
            type="button"
            className="enziu-fai-followup"
            onClick={onOpenTrip}
          >
            <CalendarDays size={13} />
            Thêm ngày để kiểm tra phòng trống
          </button>
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
  const [routeMap,setRouteMap]=useState(null);
  const closeRouteMap=useCallback(()=>setRouteMap(null),[]);
  const latestMessageRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const latestAnswer = [...messages].reverse().find((message) => message.engine);
  const comparing = Boolean([...messages].reverse().find(message => message.role === "assistant")?.comparison?.rows?.length);
  const localEngine = hasLocalEngineMetadata(latestAnswer);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

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

  const today = useMemo(() => localDateValue(), []);

  useEffect(() => {
    if (!isOpen || messages.length === 1) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = sending ? bottomRef.current : latestMessageRef.current;
    target?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: sending ? "end" : "start",
    });
  }, [isOpen, messages, sending]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleEscape(event) {
      if (event.key === "Escape") { closeAssistant(); launcherRef.current?.focus(); }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closeAssistant, isOpen]);

  useEffect(() => {
    const handleChatOpen = () => closeAssistant();
    window.addEventListener("enziu:ai-close", handleChatOpen);
    return () => window.removeEventListener("enziu:ai-close", handleChatOpen);
  }, [closeAssistant]);

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
      {routeMap ? createPortal(<HotelMapModal {...routeMap} onClose={closeRouteMap}/>,document.body) : null}
      {isOpen ? (
        <section
          id="enziu-ai-panel"
          className={`enziu-fai-panel${comparing ? " has-comparison" : ""}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby="enziu-ai-title"
        >
          <header className="enziu-fai-header">
            <div className="enziu-fai-brand">
              <span className="enziu-fai-bot-mark"><Bot size={20} /></span>
              <div>
                <strong id="enziu-ai-title">Trợ lý Enziu</strong>
                <span><i /> Cùng bạn chọn chỗ nghỉ phù hợp</span>
              </div>
            </div>

            <div className="enziu-fai-header-actions">
              <button
                type="button"
                onClick={resetConversation}
                title="Cuộc trò chuyện mới"
                aria-label="Cuộc trò chuyện mới"
              >
                <Plus size={18} />
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

          <div className="enziu-fai-source-bar">
            <span title={localEngine ? `Bộ xử lý ${latestAnswer.engine.id}; ${latestAnswer.engine.semanticUnderstandingUsed ? "mô hình ngữ nghĩa chạy nội bộ" : "đang dùng chế độ cơ bản"}; không gọi Gemini.` : "Câu trả lời được đối chiếu với thông tin trong EnziuRooms"}>
              <ShieldCheck size={13} /> Dữ liệu EnziuRooms
            </span>
            <span>{localEngine ? (latestAnswer.engine.semanticUnderstandingUsed ? "Hiểu ngữ cảnh · Nội bộ" : "Chế độ cơ bản") : "Phòng · Giá · Chuyến đi"}</span>
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
                aria-label="Bỏ khách sạn đang hỏi"
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
              aria-expanded={tripOpen}
              aria-controls="enziu-ai-trip-fields"
            >
              <span>
                <CalendarDays size={14} />
                Chuyến đi của bạn
                {trip.checkIn && trip.checkOut ? (
                  <em>{formatDate(trip.checkIn)} → {formatDate(trip.checkOut)}</em>
                ) : (
                  <em>{guestSummary(trip.adults, trip.children)}</em>
                )}
              </span>
              <ChevronDown size={15} />
            </button>

            {tripOpen ? (
              <div className="enziu-fai-trip-fields" id="enziu-ai-trip-fields">
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
                          "Kiểm tra lại giá, phòng trống và ưu đãi với ngày tôi vừa chọn.",
                        )
                      }
                    >
                      <Sparkles size={12} />
                      Áp dụng và kiểm tra
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            className="enziu-fai-messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.length === 1 ? (
              <div className="enziu-fai-welcome">
                <span className="enziu-fai-welcome-icon"><Sparkles size={25} /></span>
                <span className="enziu-fai-eyebrow">CÓ ENZIU ĐỒNG HÀNH</span>
                <h2>Chọn phòng,<br />đúng điều bạn cần.</h2>
                <p>Hỏi theo cách của bạn. Tôi sẽ xem thông tin khách sạn và chuyến đi để cùng bạn chọn.</p>
                <div className="enziu-fai-welcome-actions">
                  <button type="button" onClick={() => void sendQuestion("Phòng nào phù hợp nhất với tôi?")}><BedDouble size={18} /><span>Giúp tôi chọn phòng<small>So sánh theo nhu cầu của bạn</small></span><ChevronRight size={16} /></button>
                  <button type="button" onClick={() => void sendQuestion("Tôi muốn xem đơn đặt phòng của tôi")}><CalendarDays size={18} /><span>Xem chuyến đi của tôi<small>Thông tin đơn và thanh toán</small></span><ChevronRight size={16} /></button>
                </div>
              </div>
            ) : messages.slice(1).map((message, index) => (
              message.role === "assistant" ? (
                <AssistantMessage
                  message={message}
                  messageRef={index === messages.length - 2 ? latestMessageRef : undefined}
                  onNavigate={handleNavigate}
                  onOpenMap={setRouteMap}
                  onOpenTrip={() => {
                    setTripOpen(true);
                  }}
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
                <div><span /><span /><span /><em>Đang đối chiếu thông tin...</em></div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          {error ? (
            <div className="enziu-fai-error">{error}</div>
          ) : null}

          {messages.length > 1 ? <div className="enziu-fai-suggestions">
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
          </div> : null}

          <form className="enziu-fai-composer" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              aria-label="Câu hỏi cho trợ lý Enziu"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 112)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendQuestion(question);
                }
              }}
              placeholder="Hỏi về phòng, giá hoặc chuyến đi..."
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
            Giá cuối cùng và phòng trống được kiểm tra theo ngày ở.
          </p>
        </section>
      ) : null}

      <button
        type="button"
        ref={launcherRef}
        className={`enziu-fai-launcher ${isOpen ? "open" : ""}`}
        onClick={() => {
          if (!isOpen) window.dispatchEvent(new CustomEvent("enziu:chat-close"));
          toggleAssistant();
        }}
        aria-label={isOpen ? "Đóng Enziu AI" : "Mở Enziu AI"}
        aria-expanded={isOpen}
        aria-controls="enziu-ai-panel"
      >
        {isOpen ? <X size={23} /> : <Bot size={24} />}
        {!isOpen ? <span>Hỏi Enziu AI</span> : null}
        {!isOpen ? <i><MessageCirclePlus size={12} /></i> : null}
      </button>
    </div>
  );
}
