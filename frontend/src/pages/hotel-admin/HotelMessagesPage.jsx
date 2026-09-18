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
import AvatarImage from "../../components/ui/AvatarImage";
import {
  CHAT_MESSAGE_POSITION,
  getChatMessagePosition,
  isSameChatMessageRun,
} from "../../components/chat/chatMessagePresentation";
import { useRealtime } from "../../realtime/RealtimeContext";
import {
  getHotelAdminChatConversations,
  getHotelAdminChatMessages,
  markHotelAdminChatRead,
  sendHotelAdminChatMessage,
  setHotelAdminHumanTakeover,
} from "../../services/chatService";
import { getHotelById } from "../../services/hotelService";
import { getPublicProfile } from "../../services/profileService";
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

function resolveHotelImage(hotel) {
  if (!hotel) return null;
  if (hotel.coverImageUrl) return hotel.coverImageUrl;
  const images = Array.isArray(hotel.images) ? hotel.images : [];
  const image = images.find((item) => item?.cover || item?.isCover) ?? images[0];
  if (typeof image === "string") return image;
  return image?.imageUrl ?? image?.url ?? image?.fileUrl ?? image?.publicUrl ?? null;
}

function initials(value) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length ? words.slice(-2).map((word) => word[0]).join("").toUpperCase() : "KH";
}

export default function HotelMessagesPage() {
  const { subscribe, status: realtimeStatus } = useRealtime();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [hotelFilter, setHotelFilter] = useState("ALL");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef(null);
  const profileCacheRef = useRef(new Map());
  const hotelCacheRef = useRef(new Map());

  const selected = useMemo(
    () => conversations.find((item) => String(item.id) === String(selectedId)) ?? null,
    [conversations, selectedId],
  );

  const hotelOptions = useMemo(() => {
    const unique = new Map();
    conversations.forEach((item) => {
      if (item.hotelId) unique.set(String(item.hotelId), item.hotelName ?? "Khách sạn");
    });
    return [...unique.entries()].map(([id, name]) => ({ id, name }));
  }, [conversations]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return conversations.filter((item) => {
      if (hotelFilter !== "ALL" && String(item.hotelId) !== hotelFilter) return false;
      if (!needle) return true;
      return [item.customerName, item.hotelName, item.lastMessage]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [conversations, hotelFilter, search]);

  useEffect(() => {
    if (hotelFilter === "ALL") return;
    if (!hotelOptions.some((hotel) => hotel.id === hotelFilter)) setHotelFilter("ALL");
  }, [hotelFilter, hotelOptions]);

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
      const enriched = await Promise.all(data.map(async (item) => {
        const customerKey = String(item.customerId ?? "");
        const hotelKey = String(item.hotelId ?? "");
        let customerProfile = profileCacheRef.current.get(customerKey) ?? null;
        let hotel = hotelCacheRef.current.get(hotelKey) ?? null;

        if (!customerProfile && customerKey) {
          customerProfile = await getPublicProfile(customerKey).catch(() => null);
          if (customerProfile) profileCacheRef.current.set(customerKey, customerProfile);
        }
        if (!hotel && hotelKey) {
          hotel = await getHotelById(hotelKey).catch(() => null);
          if (hotel) hotelCacheRef.current.set(hotelKey, hotel);
        }

        return {
          ...item,
          customerName: customerProfile?.fullName ?? "Khách hàng",
          customerAvatarUrl: customerProfile?.avatarUrl ?? null,
          hotelAvatarUrl: resolveHotelImage(hotel),
        };
      }));
      setConversations(enriched);
      setSelectedId((current) => {
        if (keepSelection && current && enriched.some((item) => String(item.id) === String(current))) {
          return current;
        }
        return enriched[0]?.id ?? "";
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
              placeholder="Tìm khách hàng hoặc tin nhắn..."
              aria-label="Tìm cuộc trò chuyện"
            />
          </label>

          {hotelOptions.length > 1 ? (
            <label className="hotel-chat-hotel-filter">
              <Hotel size={16} />
              <span>Lọc khách sạn</span>
              <select value={hotelFilter} onChange={(event) => setHotelFilter(event.target.value)}>
                <option value="ALL">Tất cả khách sạn</option>
                {hotelOptions.map((hotel) => (
                  <option value={hotel.id} key={hotel.id}>{hotel.name}</option>
                ))}
              </select>
            </label>
          ) : null}

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
                    <AvatarImage
                      source={item.customerAvatarUrl}
                      alt={`Ảnh ${item.customerName}`}
                      fallback={<span>{initials(item.customerName)}</span>}
                    />
                    {Number(item.unreadCount ?? 0) > 0 ? (
                      <b>{Math.min(99, Number(item.unreadCount))}</b>
                    ) : null}
                  </div>
                  <div className="hotel-chat-conversation-copy">
                    <header>
                      <strong>{item.customerName}</strong>
                      <time>{formatDateTime(item.lastMessageAt)}</time>
                    </header>
                    <small>{item.hotelName}</small>
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
                <div className="hotel-chat-thread-hotel-icon">
                  <AvatarImage
                    source={selected.customerAvatarUrl}
                    alt={`Ảnh ${selected.customerName}`}
                    fallback={<span>{initials(selected.customerName)}</span>}
                  />
                </div>
                <div>
                  <span>{selected.hotelName ?? "Khách sạn"}</span>
                  <h2>{selected.customerName}</h2>
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
                        : "Trợ lý tự động chỉ trả lời các thông tin cơ bản; trường hợp cần xử lý riêng sẽ chuyển cho bạn."}
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
                  messages.map((message, index) => {
                    const position = getChatMessagePosition(message, "HOTEL_ADMIN");
                    const mine = position === CHAT_MESSAGE_POSITION.OUTGOING;
                    const systemEvent = position === CHAT_MESSAGE_POSITION.SYSTEM;
                    const previous = messages[index - 1];
                    const showAvatar = !mine && !isSameChatMessageRun(previous, message, "HOTEL_ADMIN");

                    if (systemEvent) {
                      return (
                        <article className="hotel-chat-admin-system-event" key={message.id} role="note">
                          <span>{message.content}</span>
                          <time>{formatDateTime(message.createdAt)}</time>
                        </article>
                      );
                    }

                    return (
                      <article
                        key={message.id}
                        className={`hotel-chat-admin-message ${mine ? "mine" : "theirs"}`}
                      >
                        {!mine ? (
                          showAvatar ? (
                            <span className="hotel-chat-message-avatar">
                              <AvatarImage
                                source={selected.customerAvatarUrl}
                                alt={`Ảnh ${selected.customerName}`}
                                fallback={<span>{initials(selected.customerName)}</span>}
                              />
                            </span>
                          ) : <span className="hotel-chat-message-avatar-spacer" />
                        ) : null}
                        <div>
                          <header>
                            <strong>{mine
                              ? (message.senderType === "HOTEL_BOT" ? "Trợ lý khách sạn" : "Phía khách sạn")
                              : "Khách hàng"}</strong>
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
