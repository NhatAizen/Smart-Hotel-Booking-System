import {
  Bot,
  CalendarDays,
  Clock3,
  Headphones,
  Hotel,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
} from "../../components/ui";
import { useRealtime } from "../../realtime/RealtimeContext";
import {
  getHotelAdminChatConversations,
  getHotelAdminChatMessages,
  markHotelAdminChatRead,
  sendHotelAdminChatMessage,
  setHotelAdminHumanTakeover,
} from "../../services/chatService";
import "./HotelMessagesPage.css";

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

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function errorText(error, fallback) {
  return (
    error?.response?.data?.message ??
    error?.response?.data?.error ??
    error?.message ??
    fallback
  );
}

function senderLabel(type) {
  if (type === "CUSTOMER") return "Khách hàng";
  if (type === "HOTEL_ADMIN") return "Nhân viên khách sạn";
  if (type === "HOTEL_BOT") return "Trợ lý tự động";
  return "EnziuRooms";
}

function senderIcon(type) {
  if (type === "CUSTOMER") return UserRound;
  if (type === "HOTEL_ADMIN") return Headphones;
  if (type === "HOTEL_BOT") return Bot;
  return ShieldCheck;
}

function arrivalLabel(value, expectedArrivalTime) {
  if (value === "CONFIRMED") return "Khách xác nhận sẽ đến";
  if (value === "ARRIVING_LATE") {
    return `Khách báo đến trễ${expectedArrivalTime ? ` · ${formatTime(expectedArrivalTime)}` : ""}`;
  }
  if (value === "NEEDS_HELP") return "Khách đang cần hỗ trợ";
  if (value === "NO_SHOW_RISK") return "Nguy cơ khách không đến";
  return "Chưa xác nhận kế hoạch đến";
}

function arrivalTone(value) {
  if (value === "CONFIRMED") return "success";
  if (value === "ARRIVING_LATE") return "warning";
  if (value === "NO_SHOW_RISK") return "danger";
  if (value === "NEEDS_HELP") return "danger";
  return "neutral";
}

export default function HotelMessagesPage() {
  const { subscribe, status: realtimeStatus } = useRealtime();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef(null);

  const selected = useMemo(
    () => conversations.find((item) => String(item.id) === String(selectedId)) ?? null,
    [conversations, selectedId],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((item) =>
      [item.hotelName, item.bookingCode, item.lastMessage]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [conversations, search]);

  const totalUnread = useMemo(
    () => conversations.reduce((total, item) => total + Number(item.unreadCount ?? 0), 0),
    [conversations],
  );

  const loadConversations = useCallback(async ({ quiet = false, keepSelection = true } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const data = await getHotelAdminChatConversations();
      setConversations(data);
      setSelectedId((current) => {
        if (keepSelection && current && data.some((item) => String(item.id) === String(current))) {
          return current;
        }
        return data[0]?.id ?? "";
      });
    } catch (requestError) {
      if (!quiet) {
        setError(errorText(requestError, "Không thể tải hộp thư khách sạn."));
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId, { quiet = false } = {}) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    if (!quiet) {
      setMessagesLoading(true);
      setError("");
    }
    try {
      const data = await getHotelAdminChatMessages(conversationId);
      setMessages(data);
      await markHotelAdminChatRead(conversationId).catch(() => null);
      setConversations((current) =>
        current.map((item) =>
          String(item.id) === String(conversationId)
            ? { ...item, unreadCount: 0 }
            : item,
        ),
      );
    } catch (requestError) {
      if (!quiet) {
        setError(errorText(requestError, "Không thể tải nội dung cuộc trò chuyện."));
      }
    } finally {
      if (!quiet) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
  }, [loadMessages, selectedId]);

  useEffect(() => {
    return subscribe("CHAT_MESSAGE_CREATED", (event) => {
      const eventConversationId = String(event?.data?.conversationId ?? "");
      void loadConversations({ quiet: true });
      if (eventConversationId && eventConversationId === String(selectedId)) {
        void loadMessages(selectedId, { quiet: true });
      }
    });
  }, [loadConversations, loadMessages, selectedId, subscribe]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, messagesLoading]);

  async function sendMessage(event) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !selectedId || sending) return;

    setSending(true);
    setError("");
    setInput("");
    try {
      await sendHotelAdminChatMessage(selectedId, content);
      await Promise.all([
        loadMessages(selectedId, { quiet: true }),
        loadConversations({ quiet: true }),
      ]);
    } catch (requestError) {
      setInput(content);
      setError(errorText(requestError, "Không thể gửi tin nhắn cho khách."));
    } finally {
      setSending(false);
    }
  }

  async function toggleTakeover() {
    if (!selected || toggleBusy) return;
    setToggleBusy(true);
    setError("");
    try {
      const updated = await setHotelAdminHumanTakeover(selected.id, !selected.humanTakeover);
      setConversations((current) =>
        current.map((item) =>
          String(item.id) === String(updated.id) ? { ...item, ...updated } : item,
        ),
      );
      await loadMessages(selected.id, { quiet: true });
    } catch (requestError) {
      setError(errorText(requestError, "Không thể thay đổi chế độ trả lời tự động."));
    } finally {
      setToggleBusy(false);
    }
  }

  return (
    <main className="hotel-messages-page">
      <PageHeader
        className="hotel-messages-heading"
        eyebrow="Tin nhắn khách hàng"
        title="Hộp thư vận hành"
        description="Theo dõi hội thoại, ưu tiên khách cần hỗ trợ và tiếp quản trợ lý tự động khi cần quyết định trực tiếp."
        icon={<MessageCircle size={22} />}
        actions={(
          <button type="button" onClick={() => void loadConversations()} disabled={loading}>
            <RefreshCw size={17} className={loading ? "spin" : ""} />
            Làm mới
          </button>
        )}
      />

      <ErrorMessage message={error} onRetry={() => void loadConversations()} />

      <section className="hotel-chat-workspace">
        <aside className="hotel-chat-list-panel">
          <div className="hotel-chat-list-summary">
            <div>
              <strong>{conversations.length}</strong>
              <span>Hội thoại</span>
            </div>
            <div>
              <strong>{totalUnread}</strong>
              <span>Chưa đọc</span>
            </div>
            <div>
              <strong className={realtimeStatus === "connected" ? "online" : "offline"}>
                {realtimeStatus === "connected" ? "Đang kết nối" : "Mất kết nối"}
              </strong>
              <span>Trạng thái trực tuyến</span>
            </div>
          </div>

          <label className="hotel-chat-list-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm mã đặt phòng hoặc tin nhắn..."
              aria-label="Tìm cuộc trò chuyện"
            />
          </label>

          <div className="hotel-chat-conversations">
            {loading ? (
              <div className="hotel-chat-admin-empty">
                <LoaderCircle size={24} className="spin" />
                Đang tải hội thoại...
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                compact
                className="hotel-chat-admin-empty"
                icon={<MessageCircle size={28} />}
                title="Chưa có hội thoại"
                description="Hội thoại sẽ xuất hiện khi khách liên hệ từ trang khách sạn hoặc đơn đặt phòng."
              />
            ) : (
              filtered.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`hotel-chat-conversation-item ${String(selectedId) === String(item.id) ? "active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                  aria-pressed={String(selectedId) === String(item.id)}
                >
                  <div className="hotel-chat-conversation-avatar">
                    <UserRound size={18} />
                    {Number(item.unreadCount ?? 0) > 0 ? (
                      <span>{Math.min(99, Number(item.unreadCount))}</span>
                    ) : null}
                  </div>
                  <div className="hotel-chat-conversation-copy">
                    <header>
                      <strong>{item.bookingCode ?? "Hỏi trước khi đặt"}</strong>
                      <time>{formatDateTime(item.lastMessageAt)}</time>
                    </header>
                    <p>{item.lastMessage || "Cuộc trò chuyện mới"}</p>
                    <footer>
                      <StatusBadge
                        status={item.arrivalStatus}
                        label={arrivalLabel(item.arrivalStatus, item.expectedArrivalTime)}
                        tone={arrivalTone(item.arrivalStatus)}
                        size="sm"
                      />
                    </footer>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="hotel-chat-thread-panel">
          {!selected ? (
            <EmptyState
              className="hotel-chat-thread-empty"
              icon={<MessageCircle size={34} />}
              title="Chọn một cuộc trò chuyện"
              description="Tin nhắn mới của khách sẽ xuất hiện tại đây."
            />
          ) : (
            <>
              <header className="hotel-chat-thread-header">
                <div className="hotel-chat-thread-hotel-icon"><Hotel size={21} /></div>
                <div>
                  <span>{selected.hotelName ?? "Khách sạn"}</span>
                  <h2>{selected.bookingCode ?? "Hỏi trước khi đặt phòng"}</h2>
                  <p>
                    <CalendarDays size={14} />
                    {selected.bookingId ? (
                      <>
                        {formatDate(selected.checkIn)} {formatTime(selected.checkInTime, "Chưa cập nhật")}
                        <span>→</span>
                        {formatDate(selected.checkOut)} {formatTime(selected.checkOutTime, "Chưa cập nhật")}
                      </>
                    ) : (
                      <>Khách đang hỏi thông tin trước khi đặt phòng</>
                    )}
                  </p>
                </div>
                {selected.bookingId ? (
                  <StatusBadge
                    className="hotel-chat-arrival-badge"
                    status={selected.arrivalStatus}
                    label={arrivalLabel(selected.arrivalStatus, selected.expectedArrivalTime)}
                    tone={arrivalTone(selected.arrivalStatus)}
                    icon={<Clock3 size={15} />}
                    size="sm"
                  />
                ) : (
                  <div className="hotel-chat-arrival-badge neutral">
                    <MessageCircle size={15} />
                    Hỏi trước khi đặt
                  </div>
                )}
              </header>

              <div className="hotel-chat-bot-control">
                <div>
                  {selected.humanTakeover ? <Headphones size={18} /> : <Bot size={18} />}
                  <div>
                    <strong>{selected.humanTakeover ? "Nhân viên đang tiếp quản" : "Trợ lý tự động đang trả lời"}</strong>
                    <span>
                      {selected.humanTakeover
                        ? "Bot tạm dừng cho đến khi bạn bật lại."
                        : "Bot chỉ trả lời dữ liệu chắc chắn; yêu cầu ngoại lệ sẽ chuyển cho bạn."}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={toggleBusy}
                  className={selected.humanTakeover ? "enable-bot" : "takeover"}
                  onClick={() => void toggleTakeover()}
                  aria-pressed={selected.humanTakeover}
                >
                  {toggleBusy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : selected.humanTakeover ? (
                    <Bot size={16} />
                  ) : (
                    <Headphones size={16} />
                  )}
                  {selected.humanTakeover ? "Bật lại trợ lý" : "Nhân viên tiếp quản"}
                </button>
              </div>

              <div
                className="hotel-chat-thread-messages"
                ref={messagesRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {messagesLoading ? (
                  <div className="hotel-chat-admin-empty">
                    <LoaderCircle size={24} className="spin" />
                    Đang tải tin nhắn...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="hotel-chat-admin-empty">
                    <MessageCircle size={30} />
                    Chưa có tin nhắn nào.
                  </div>
                ) : (
                  messages.map((message) => {
                    const mine = message.senderType === "HOTEL_ADMIN";
                    const Icon = senderIcon(message.senderType);
                    const system = ["SYSTEM", "REMINDER", "ACTION"].includes(message.messageType);

                    return (
                      <article
                        key={message.id}
                        className={`hotel-chat-admin-message ${mine ? "mine" : "theirs"} ${system ? "system-message" : ""}`}
                      >
                        {!mine ? <span><Icon size={15} /></span> : null}
                        <div>
                          <header>
                            <strong>{senderLabel(message.senderType)}</strong>
                            <time>{formatDateTime(message.createdAt)}</time>
                          </header>
                          <p>{message.content}</p>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              <form className="hotel-chat-admin-composer" onSubmit={sendMessage}>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(event);
                    }
                  }}
                  rows={1}
                  maxLength={1200}
                  placeholder="Nhắn trực tiếp cho khách..."
                  aria-label="Nội dung tin nhắn cho khách"
                />
                <button type="submit" disabled={sending || !input.trim()} aria-label="Gửi tin nhắn">
                  {sending ? <LoaderCircle size={19} className="spin" /> : <Send size={19} />}
                </button>
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
