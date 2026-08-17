import {
  Bot,
  CheckCircle2,
  Clock3,
  Headphones,
  Hotel,
  LoaderCircle,
  MessageCircle,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRealtime } from "../../realtime/RealtimeContext";
import {
  ensureBookingConversation,
  ensureHotelConversation,
  getCustomerChatMessages,
  markCustomerChatRead,
  requestCustomerLateCheckout,
  sendCustomerChatMessage,
  updateCustomerArrival,
} from "../../services/chatService";
import "./CustomerHotelChat.css";

function formatDate(value) {
  if (!value) return "Chưa cập nhật";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value, fallback = "--:--") {
  if (!value) return fallback;
  return String(value).slice(0, 5);
}

function formatMessageTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function senderLabel(senderType) {
  if (senderType === "HOTEL_ADMIN") return "Nhân viên khách sạn";
  if (senderType === "HOTEL_BOT") return "Tự động";
  if (senderType === "SYSTEM") return "EnziuRooms";
  return "Bạn";
}

function senderIcon(senderType) {
  if (senderType === "HOTEL_BOT") return Bot;
  if (senderType === "SYSTEM") return Sparkles;
  if (senderType === "HOTEL_ADMIN") return Headphones;
  return UserRound;
}

function errorText(error, fallback) {
  return (
    error?.response?.data?.message ??
    error?.response?.data?.error ??
    error?.message ??
    fallback
  );
}

export default function CustomerHotelChat({
  booking = null,
  hotel,
  open,
  onClose,
  onConversationUpdated,
}) {
  const { subscribe } = useRealtime();

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [arrivalLateOpen, setArrivalLateOpen] = useState(false);
  const [expectedArrivalTime, setExpectedArrivalTime] = useState("22:00");
  const [lateCheckoutOpen, setLateCheckoutOpen] = useState(false);
  const [lateCheckoutTime, setLateCheckoutTime] = useState("14:00");
  const [lateCheckoutNote, setLateCheckoutNote] = useState("");

  const scrollRef = useRef(null);
  const conversationRef = useRef(null);
  const onConversationUpdatedRef = useRef(onConversationUpdated);

  const conversationId = conversation?.id ?? null;
  const linkedBooking = Boolean(conversation?.bookingId);

  useEffect(() => {
    onConversationUpdatedRef.current = onConversationUpdated;
  }, [onConversationUpdated]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  const notifyConversationUpdated = useCallback((value) => {
    onConversationUpdatedRef.current?.(value);
  }, []);

  const loadMessages = useCallback(
    async (id, { quiet = false } = {}) => {
      if (!id) return;

      if (!quiet) setLoading(true);

      try {
        const data = await getCustomerChatMessages(id);
        setMessages(Array.isArray(data) ? data : []);

        await markCustomerChatRead(id).catch(() => null);

        const current = conversationRef.current;
        if (current) {
          const next = {
            ...current,
            unreadCount: 0,
          };
          conversationRef.current = next;
          setConversation(next);
          notifyConversationUpdated(next);
        }
      } catch (requestError) {
        if (!quiet) {
          setError(
            errorText(
              requestError,
              "Không thể tải tin nhắn với khách sạn.",
            ),
          );
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [notifyConversationUpdated],
  );

  const openConversation = useCallback(async () => {
    const bookingId = booking?.id ?? null;
    const hotelId = hotel?.id ?? booking?.hotelId ?? null;

    if (!bookingId && !hotelId) {
      setError("Không xác định được khách sạn để mở hộp chat.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = bookingId
        ? await ensureBookingConversation(bookingId)
        : await ensureHotelConversation(hotelId);

      conversationRef.current = data;
      setConversation(data);
      notifyConversationUpdated(data);

      const nextMessages = await getCustomerChatMessages(data.id);
      setMessages(Array.isArray(nextMessages) ? nextMessages : []);

      await markCustomerChatRead(data.id).catch(() => null);
    } catch (requestError) {
      setError(
        errorText(
          requestError,
          "Không thể mở hộp chat với khách sạn.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [booking?.hotelId, booking?.id, hotel?.id, notifyConversationUpdated]);

  useEffect(() => {
    if (!open) return;

    setConversation(null);
    conversationRef.current = null;
    setMessages([]);
    setInput("");
    setError("");
    setArrivalLateOpen(false);
    setLateCheckoutOpen(false);

    void openConversation();
  }, [open, openConversation]);

  useEffect(() => {
    if (!open || !conversationId) return undefined;

    return subscribe("CHAT_MESSAGE_CREATED", (event) => {
      if (
        String(event?.data?.conversationId ?? "") !==
        String(conversationId)
      ) {
        return;
      }

      void loadMessages(conversationId, { quiet: true });
    });
  }, [conversationId, loadMessages, open, subscribe]);

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const arrivalState = useMemo(() => {
    const value = String(conversation?.arrivalStatus ?? "UNKNOWN");

    if (value === "CONFIRMED") return "Bạn đã xác nhận sẽ đến";
    if (value === "ARRIVING_LATE") {
      return `Bạn báo đến trễ${
        conversation?.expectedArrivalTime
          ? ` lúc ${formatTime(conversation.expectedArrivalTime)}`
          : ""
      }`;
    }
    if (value === "NEEDS_HELP") return "Đang cần khách sạn hỗ trợ";
    if (value === "NO_SHOW_RISK") return "Khách sạn đang chờ bạn xác nhận";
    return "Chưa xác nhận kế hoạch đến";
  }, [conversation]);

  const quickQuestions = useMemo(() => {
    if (linkedBooking) {
      return [
        "Mấy giờ tôi nhận phòng?",
        "Tôi đã thanh toán bao nhiêu?",
        "Khách sạn ở đâu?",
      ];
    }

    return [
      "Mấy giờ nhận phòng?",
      "Có những loại phòng nào?",
      "Khách sạn ở đâu?",
    ];
  }, [linkedBooking]);

  const sendText = useCallback(
    async (content) => {
      const text = String(content ?? "").trim();

      if (!text || !conversationId || sending) return;

      setSending(true);
      setError("");

      try {
        await sendCustomerChatMessage(conversationId, text);
        await loadMessages(conversationId, { quiet: true });
        return true;
      } catch (requestError) {
        setError(
          errorText(
            requestError,
            "Không thể gửi tin nhắn.",
          ),
        );
        return false;
      } finally {
        setSending(false);
      }
    },
    [conversationId, loadMessages, sending],
  );

  async function sendMessage(event) {
    event?.preventDefault?.();

    const content = input.trim();
    if (!content) return;

    setInput("");

    const sent = await sendText(content);
    if (!sent) setInput(content);
  }

  async function updateArrival(status, time = null) {
    if (!conversationId || actionBusy || !linkedBooking) return;

    setActionBusy(true);
    setError("");

    try {
      const updated = await updateCustomerArrival(
        conversationId,
        status,
        time,
      );

      conversationRef.current = updated;
      setConversation(updated);
      notifyConversationUpdated(updated);
      setArrivalLateOpen(false);

      await loadMessages(conversationId, { quiet: true });
    } catch (requestError) {
      setError(
        errorText(
          requestError,
          "Không thể cập nhật kế hoạch đến khách sạn.",
        ),
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function submitLateCheckout(event) {
    event.preventDefault();
    if (!conversationId || actionBusy || !linkedBooking) return;

    setActionBusy(true);
    setError("");

    try {
      await requestCustomerLateCheckout(
        conversationId,
        lateCheckoutTime,
        lateCheckoutNote,
      );

      setLateCheckoutOpen(false);
      setLateCheckoutNote("");
      await loadMessages(conversationId, { quiet: true });
    } catch (requestError) {
      setError(
        errorText(
          requestError,
          "Không thể gửi yêu cầu trả phòng muộn.",
        ),
      );
    } finally {
      setActionBusy(false);
    }
  }

  if (!open) return null;

  return (
    <section
      className="hotel-chat-box"
      role="dialog"
      aria-modal="false"
      aria-labelledby="hotel-chat-title"
    >
      <header className="hotel-chat-header">
        <div className="hotel-chat-avatar">
          <Hotel size={20} />
        </div>

        <div className="hotel-chat-header-copy">
          <h2 id="hotel-chat-title">{conversation?.hotelName ?? hotel?.name ?? "Khách sạn"}</h2>
          <p>
            <span className="hotel-chat-online-dot" aria-hidden="true" />
            {conversation?.humanTakeover
              ? "Nhân viên đang hỗ trợ trực tiếp"
              : "Trợ lý tự động đang trực tuyến"}
          </p>
        </div>

        <button
          type="button"
          className="hotel-chat-close"
          onClick={onClose}
          aria-label="Đóng chat"
        >
          <X size={20} />
        </button>
      </header>

      {linkedBooking ? (
        <div className="hotel-chat-booking-strip">
          <div>
            <small>Booking</small>
            <strong>{conversation?.bookingCode ?? booking?.bookingCode ?? "Chưa có mã"}</strong>
          </div>
          <div>
            <small>Nhận phòng</small>
            <strong>
              {formatDate(conversation?.checkIn ?? booking?.checkIn)} ·{" "}
              {formatTime(conversation?.checkInTime, "Chưa cập nhật")}
            </strong>
          </div>
          <div>
            <small>Trả phòng</small>
            <strong>
              {formatDate(conversation?.checkOut ?? booking?.checkOut)} ·{" "}
              {formatTime(conversation?.checkOutTime, "Chưa cập nhật")}
            </strong>
          </div>
        </div>
      ) : (
        <div className="hotel-chat-general-note">
          <Bot size={15} />
          Bạn có thể hỏi về phòng, giá niêm yết, tiện nghi, địa chỉ và giờ nhận/trả phòng.
        </div>
      )}

      <div
        className="hotel-chat-messages"
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {loading ? (
          <div className="hotel-chat-loading">
            <LoaderCircle size={24} className="spin" />
            Đang mở hội thoại...
          </div>
        ) : messages.length === 0 ? (
          <div className="hotel-chat-empty">
            <MessageCircle size={32} />
            <strong>Nhắn trực tiếp cho khách sạn</strong>
            <span>Trợ lý tự động sẽ trả lời ngay các câu hỏi thường gặp.</span>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.senderType === "CUSTOMER";
            const auto = message.senderType === "HOTEL_BOT";
            const Icon = senderIcon(message.senderType);
            const system = ["SYSTEM", "REMINDER", "ACTION"].includes(
              message.messageType,
            );

            return (
              <article
                key={message.id}
                className={`hotel-chat-message ${mine ? "mine" : "theirs"} ${
                  system ? "system-message" : ""
                }`}
              >
                {!mine ? (
                  <span className="hotel-chat-message-icon">
                    <Icon size={14} />
                  </span>
                ) : null}

                <div className="hotel-chat-bubble-wrap">
                  <div className="hotel-chat-bubble-meta">
                    <strong>{senderLabel(message.senderType)}</strong>
                    {auto ? <span className="hotel-chat-auto-badge">🤖 Tự động</span> : null}
                  </div>

                  <div className="hotel-chat-bubble">
                    <p>{message.content}</p>
                  </div>

                  <time>{formatMessageTime(message.createdAt)}</time>
                </div>
              </article>
            );
          })
        )}
      </div>

      {linkedBooking ? (
        <div className="hotel-chat-booking-actions">
          <div className="hotel-chat-arrival-state">
            <CheckCircle2 size={15} />
            {arrivalState}
          </div>

          <div className="hotel-chat-action-row">
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void updateArrival("CONFIRMED")}
            >
              Tôi sẽ đến
            </button>
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => setArrivalLateOpen((current) => !current)}
              aria-expanded={arrivalLateOpen}
            >
              Đến trễ
            </button>
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => setLateCheckoutOpen((current) => !current)}
              aria-expanded={lateCheckoutOpen}
            >
              Trả muộn
            </button>
          </div>

          {arrivalLateOpen ? (
            <form
              className="hotel-chat-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void updateArrival("ARRIVING_LATE", expectedArrivalTime);
              }}
            >
              <Clock3 size={16} />
              <input
                type="time"
                value={expectedArrivalTime}
                onChange={(event) => setExpectedArrivalTime(event.target.value)}
                aria-label="Giờ dự kiến đến khách sạn"
                required
              />
              <button type="submit" disabled={actionBusy}>
                Xác nhận
              </button>
            </form>
          ) : null}

          {lateCheckoutOpen ? (
            <form className="hotel-chat-late-form" onSubmit={submitLateCheckout}>
              <input
                type="time"
                value={lateCheckoutTime}
                onChange={(event) => setLateCheckoutTime(event.target.value)}
                aria-label="Giờ trả phòng muộn mong muốn"
                required
              />
              <input
                type="text"
                value={lateCheckoutNote}
                onChange={(event) => setLateCheckoutNote(event.target.value)}
                placeholder="Lý do (không bắt buộc)"
                aria-label="Lý do xin trả phòng muộn"
                maxLength={240}
              />
              <button type="submit" disabled={actionBusy}>
                Gửi yêu cầu
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="hotel-chat-quick-questions">
        {quickQuestions.map((text) => (
          <button
            key={text}
            type="button"
            disabled={!conversationId || sending}
            onClick={() => void sendText(text)}
          >
            {text}
          </button>
        ))}
      </div>

      {error ? <div className="hotel-chat-error" role="alert">{error}</div> : null}

      <form className="hotel-chat-composer" onSubmit={sendMessage}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage(event);
            }
          }}
          placeholder="Nhắn tin cho khách sạn..."
          aria-label="Nội dung tin nhắn"
          rows={1}
          maxLength={1200}
          disabled={!conversationId || sending}
        />

        <button
          type="submit"
          disabled={!conversationId || sending || !input.trim()}
          aria-label="Gửi tin nhắn"
        >
          {sending ? (
            <LoaderCircle size={19} className="spin" />
          ) : (
            <Send size={19} />
          )}
        </button>
      </form>
    </section>
  );
}
