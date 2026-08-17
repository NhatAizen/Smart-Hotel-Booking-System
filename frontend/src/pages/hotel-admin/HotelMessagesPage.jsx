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
  if (!value) return "--";
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
  if (value === "NO_SHOW_RISK") return "Nguy cơ no-show";
  return "Chưa xác nhận kế hoạch đến";
}

function arrivalTone(value) {
  if (value === "CONFIRMED") return "good";
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
    if (!quiet) setLoading(true);
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
    if (!quiet) setMessagesLoading(true);
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
      <section className="hotel-messages-heading">
        <div>
          <span>TIN NHẮN KHÁCH HÀNG</span>
          <h1>Chat với khách hàng</h1>
          <p>Trợ lý tự động xử lý câu hỏi thường gặp. Nhân viên chỉ cần tiếp quản khi khách cần quyết định thật.</p>
        </div>
        <button type="button" onClick={() => void loadConversations()}>
          <RefreshCw size={17} />
          Làm mới
        </button>
      </section>

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
                {realtimeStatus === "connected" ? "Live" : "Offline"}
              </strong>
              <span>Realtime</span>
            </div>
          </div>

          <label className="hotel-chat-list-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm booking hoặc tin nhắn..."
            />
          </label>

          <div className="hotel-chat-conversations">
            {loading ? (
              <div className="hotel-chat-admin-empty">
                <LoaderCircle size={24} className="spin" />
                Đang tải hội thoại...
              </div>
            ) : filtered.length === 0 ? (
              <div className="hotel-chat-admin-empty">
                <MessageCircle size={30} />
                <strong>Chưa có hội thoại</strong>
                <span>Khách có thể chat từ trang khách sạn; booking đã xác nhận sẽ tự gắn thêm lịch nhận/trả phòng.</span>
              </div>
            ) : (
              filtered.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`hotel-chat-conversation-item ${String(selectedId) === String(item.id) ? "active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
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
                      <span className={arrivalTone(item.arrivalStatus)}>
                        {arrivalLabel(item.arrivalStatus, item.expectedArrivalTime)}
                      </span>
                    </footer>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="hotel-chat-thread-panel">
          {!selected ? (
            <div className="hotel-chat-thread-empty">
              <MessageCircle size={44} />
              <h2>Chọn một cuộc trò chuyện</h2>
              <p>Tin nhắn realtime của khách sẽ xuất hiện tại đây.</p>
            </div>
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
                        {formatDate(selected.checkIn)} {formatTime(selected.checkInTime, "14:00")}
                        <span>→</span>
                        {formatDate(selected.checkOut)} {formatTime(selected.checkOutTime, "12:00")}
                      </>
                    ) : (
                      <>Khách đang hỏi thông tin trước khi đặt phòng</>
                    )}
                  </p>
                </div>
                {selected.bookingId ? (
                  <div className={`hotel-chat-arrival-badge ${arrivalTone(selected.arrivalStatus)}`}>
                    <Clock3 size={15} />
                    {arrivalLabel(selected.arrivalStatus, selected.expectedArrivalTime)}
                  </div>
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

              <div className="hotel-chat-thread-messages" ref={messagesRef}>
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

              {error ? <div className="hotel-chat-admin-error">{error}</div> : null}

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
                />
                <button type="submit" disabled={sending || !input.trim()}>
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
