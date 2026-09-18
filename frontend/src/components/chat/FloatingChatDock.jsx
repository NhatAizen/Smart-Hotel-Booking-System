import {
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  Clock3,
  Headphones,
  Hotel,
  LoaderCircle,
  MessageCircle,
  Minus,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAiAssistant } from "../../ai/AiAssistantContext";
import { useAuth } from "../../auth/AuthContext";
import { useFloatingChat } from "../../chat/FloatingChatContext";
import { useRealtime } from "../../realtime/RealtimeContext";
import {
  ensureBookingConversation,
  ensureHotelConversation,
  getCustomerChatMessages,
  getCustomerConversations,
  getHotelAdminChatConversations,
  getHotelAdminChatMessages,
  markCustomerChatRead,
  markHotelAdminChatRead,
  requestCustomerLateCheckout,
  sendCustomerChatMessage,
  sendHotelAdminChatMessage,
  setHotelAdminHumanTakeover,
  updateCustomerArrival,
} from "../../services/chatService";
import { getHotelById } from "../../services/hotelService";
import { getPublicProfile } from "../../services/profileService";
import AvatarImage from "../ui/AvatarImage";
import {
  CHAT_MESSAGE_GROUP,
  CHAT_MESSAGE_POSITION,
  getChatMessageGroup,
  getChatMessagePosition,
  isSameChatMessageRun,
} from "./chatMessagePresentation";
import "./FloatingChatDock.css";

const SUPPORTED_ROLES = new Set(["CUSTOMER", "HOTEL_ADMIN"]);

function normalizeRole(value) {
  return String(value ?? "").replace(/^ROLE_/i, "").trim().toUpperCase();
}

function errorText(error, fallback) {
  return error?.response?.data?.message
    ?? error?.response?.data?.error
    ?? error?.message
    ?? fallback;
}

function resolveHotelImage(hotel) {
  if (!hotel) return null;
  if (hotel.coverImageUrl) return hotel.coverImageUrl;
  const images = Array.isArray(hotel.images) ? hotel.images : [];
  const image = images.find((item) => item?.cover || item?.isCover) ?? images[0];
  if (typeof image === "string") return image;
  return image?.imageUrl ?? image?.url ?? image?.fileUrl ?? image?.publicUrl ?? null;
}

function initials(value, fallback = "ER") {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return parts.slice(-2).map((part) => part[0]).join("").toUpperCase();
}

function formatConversationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("vi-VN", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit" }).format(date);
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

function formatDate(value) {
  if (!value) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value, fallback = "Chưa cập nhật") {
  return value ? String(value).slice(0, 5) : fallback;
}

function sortConversations(items) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.lastMessageAt ?? left.createdAt ?? 0).getTime();
    const rightTime = new Date(right.lastMessageAt ?? right.createdAt ?? 0).getTime();
    return rightTime - leftTime;
  });
}

async function cachedValue(cache, key, loader) {
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const request = loader();
  cache.set(key, request);
  const value = await request;
  if (value) cache.set(key, value);
  else cache.delete(key);
  return value;
}

function Avatar({ source, name, kind = "person", className = "" }) {
  const fallback = (
    <span className={`enziu-chat-avatar-fallback ${kind}`} aria-hidden="true">
      {initials(name, kind === "hotel" ? "KS" : "KH")}
    </span>
  );

  return (
    <span className={`enziu-chat-avatar ${className}`}>
      <AvatarImage source={source} alt={`Ảnh ${name || "hội thoại"}`} fallback={fallback} />
    </span>
  );
}

export default function FloatingChatDock() {
  const { user, isAuthenticated } = useAuth();
  const { isOpen: isAiOpen } = useAiAssistant();
  const { subscribe, status: realtimeStatus } = useRealtime();
  const { directRequest, clearDirectRequest } = useFloatingChat();
  const role = normalizeRole(user?.role);
  const enabled = isAuthenticated && SUPPORTED_ROLES.has(role);
  const customerMode = role === "CUSTOMER";

  const [open, setOpen] = useState(false);
  const [view, setView] = useState("list");
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [hotelFilter, setHotelFilter] = useState("ALL");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [expectedArrivalTime, setExpectedArrivalTime] = useState("22:00");
  const [lateCheckoutTime, setLateCheckoutTime] = useState("14:00");
  const [lateCheckoutNote, setLateCheckoutNote] = useState("");
  const [bookingToolsOpen, setBookingToolsOpen] = useState(false);

  const panelRef = useRef(null);
  const messagesRef = useRef(null);
  const selectedIdRef = useRef("");
  const openRef = useRef(false);
  const viewRef = useRef("list");
  const hotelCacheRef = useRef(new Map());
  const profileCacheRef = useRef(new Map());

  const selected = useMemo(
    () => conversations.find((item) => String(item.id) === String(selectedId)) ?? null,
    [conversations, selectedId],
  );

  const totalUnread = useMemo(
    () => conversations.reduce((total, item) => total + Number(item.unreadCount ?? 0), 0),
    [conversations],
  );

  const hotelOptions = useMemo(() => {
    if (customerMode) return [];
    const unique = new Map();
    conversations.forEach((item) => {
      if (item.hotelId) unique.set(String(item.hotelId), item.hotelName ?? "Khách sạn");
    });
    return [...unique.entries()].map(([id, name]) => ({ id, name }));
  }, [conversations, customerMode]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return conversations.filter((item) => {
      if (!customerMode && hotelFilter !== "ALL" && String(item.hotelId) !== hotelFilter) {
        return false;
      }
      if (!needle) return true;
      return [item.hotelName, item.customerName, item.lastMessage]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [conversations, customerMode, hotelFilter, search]);

  useEffect(() => {
    if (hotelFilter === "ALL") return;
    if (!hotelOptions.some((item) => item.id === hotelFilter)) setHotelFilter("ALL");
  }, [hotelFilter, hotelOptions]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    openRef.current = open;
    viewRef.current = view;
  }, [open, view]);

  useEffect(() => {
    const closeForAi = () => setOpen(false);
    window.addEventListener("enziu:chat-close", closeForAi);
    return () => window.removeEventListener("enziu:chat-close", closeForAi);
  }, []);

  useEffect(() => {
    if (isAiOpen) setOpen(false);
  }, [isAiOpen]);

  const hydrateConversation = useCallback(async (conversation, suppliedHotel = null) => {
    const hotelId = String(conversation?.hotelId ?? suppliedHotel?.id ?? "");
    let hotel = suppliedHotel;

    if (hotelId) {
      if (hotel) hotelCacheRef.current.set(hotelId, hotel);
      hotel = hotel ?? await cachedValue(
        hotelCacheRef.current,
        hotelId,
        () => getHotelById(hotelId).catch(() => null),
      );
    }

    let customerProfile = null;
    let hotelAdminProfile = null;
    const profileId = customerMode
      ? String(conversation?.hotelAdminId ?? "")
      : String(conversation?.customerId ?? "");
    if (profileId) {
      const publicProfile = await cachedValue(
        profileCacheRef.current,
        profileId,
        () => getPublicProfile(profileId).catch(() => null),
      );
      if (customerMode) hotelAdminProfile = publicProfile;
      else customerProfile = publicProfile;
    }

    return {
      ...conversation,
      hotelRecord: hotel,
      hotelAvatarUrl: resolveHotelImage(hotel),
      customerProfile,
      customerName: customerProfile?.fullName ?? "Khách hàng",
      customerAvatarUrl: customerProfile?.avatarUrl ?? null,
      hotelAdminName: hotelAdminProfile?.fullName ?? "Nhân viên khách sạn",
      hotelAdminAvatarUrl: hotelAdminProfile?.avatarUrl ?? null,
    };
  }, [customerMode]);

  const hydrateConversations = useCallback(async (items) => Promise.all(
    items.map((item) => hydrateConversation(item)),
  ), [hydrateConversation]);

  const loadConversations = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled) return [];
    if (!quiet) {
      setLoading(true);
      setError("");
    }

    try {
      const data = customerMode
        ? await getCustomerConversations()
        : await getHotelAdminChatConversations();
      const hydrated = sortConversations(await hydrateConversations(data));
      setConversations(hydrated);
      return hydrated;
    } catch (requestError) {
      if (!quiet) setError(errorText(requestError, "Không thể tải danh sách hội thoại."));
      return [];
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [customerMode, enabled, hydrateConversations]);

  const notifyConversationUpdated = useCallback((conversation) => {
    window.dispatchEvent(new CustomEvent("enziu:chat-conversation-updated", {
      detail: conversation,
    }));
  }, []);

  const loadMessages = useCallback(async (conversationId, { quiet = false } = {}) => {
    if (!conversationId || !enabled) return;
    if (!quiet) {
      setMessagesLoading(true);
      setError("");
    }

    try {
      const data = customerMode
        ? await getCustomerChatMessages(conversationId)
        : await getHotelAdminChatMessages(conversationId);
      setMessages(Array.isArray(data) ? data : []);

      const markRead = customerMode ? markCustomerChatRead : markHotelAdminChatRead;
      await markRead(conversationId).catch(() => null);
      setConversations((current) => current.map((item) => (
        String(item.id) === String(conversationId)
          ? { ...item, unreadCount: 0 }
          : item
      )));
      notifyConversationUpdated({ id: conversationId, unreadCount: 0 });
    } catch (requestError) {
      if (!quiet) setError(errorText(requestError, "Không thể tải nội dung hội thoại."));
    } finally {
      if (!quiet) setMessagesLoading(false);
    }
  }, [customerMode, enabled, notifyConversationUpdated]);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setConversations([]);
      setSelectedId("");
      return;
    }
    void loadConversations({ quiet: true });
  }, [enabled, loadConversations]);

  useEffect(() => {
    if (!enabled || !directRequest || !customerMode) return;
    let active = true;

    async function openDirectConversation() {
      window.dispatchEvent(new CustomEvent("enziu:ai-close"));
      setOpen(true);
      setView("thread");
      setLoading(true);
      setError("");
      try {
        const conversation = directRequest.booking?.id
          ? await ensureBookingConversation(directRequest.booking.id)
          : await ensureHotelConversation(directRequest.hotel?.id);
        const hydrated = await hydrateConversation(conversation, directRequest.hotel);
        if (!active) return;
        setConversations((current) => sortConversations([
          hydrated,
          ...current.filter((item) => String(item.id) !== String(hydrated.id)),
        ]));
        setSelectedId(hydrated.id);
        notifyConversationUpdated(hydrated);
      } catch (requestError) {
        if (active) setError(errorText(requestError, "Không thể mở hội thoại với khách sạn."));
      } finally {
        if (active) setLoading(false);
        clearDirectRequest(directRequest.id);
      }
    }

    void openDirectConversation();
    return () => {
      active = false;
    };
  }, [
    clearDirectRequest,
    customerMode,
    directRequest,
    enabled,
    hydrateConversation,
    notifyConversationUpdated,
  ]);

  useEffect(() => {
    if (!open || view !== "thread" || !selectedId) return;
    void loadMessages(selectedId);
  }, [loadMessages, open, selectedId, view]);

  useEffect(() => subscribe("CHAT_MESSAGE_CREATED", (event) => {
    if (!enabled) return;
    const conversationId = String(event?.data?.conversationId ?? "");
    void loadConversations({ quiet: true });
    if (
      conversationId
      && conversationId === String(selectedIdRef.current)
      && openRef.current
      && viewRef.current === "thread"
    ) {
      void loadMessages(conversationId, { quiet: true });
    }
  }), [enabled, loadConversations, loadMessages, subscribe]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => panelRef.current?.focus());
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 640px)").matches) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, messagesLoading]);

  const openThread = useCallback((conversationId) => {
    setSelectedId(conversationId);
    setView("thread");
    setOpen(true);
    setError("");
  }, []);

  const sendMessage = useCallback(async (content, retryId = null) => {
    const text = String(content ?? "").trim();
    if (!text || !selectedId || sending) return;
    const tempId = retryId ?? `pending-${Date.now()}`;
    const senderType = customerMode ? "CUSTOMER" : "HOTEL_ADMIN";

    setSending(true);
    setError("");
    setMessages((current) => [
      ...current.filter((message) => message.id !== tempId),
      {
        id: tempId,
        senderType,
        content: text,
        createdAt: new Date().toISOString(),
        deliveryState: "sending",
      },
    ]);

    try {
      if (customerMode) {
        await sendCustomerChatMessage(selectedId, text);
      } else {
        await sendHotelAdminChatMessage(selectedId, text);
      }
      setInput("");
      await Promise.all([
        loadMessages(selectedId, { quiet: true }),
        loadConversations({ quiet: true }),
      ]);
    } catch (requestError) {
      setMessages((current) => current.map((message) => (
        message.id === tempId ? { ...message, deliveryState: "failed" } : message
      )));
      setError(errorText(requestError, "Không thể gửi tin nhắn."));
    } finally {
      setSending(false);
    }
  }, [customerMode, loadConversations, loadMessages, selectedId, sending]);

  async function submitMessage(event) {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;
    setInput("");
    await sendMessage(content);
  }

  async function updateArrival(status, expectedTime = null) {
    if (!selected?.bookingId || actionBusy) return;
    setActionBusy(true);
    setError("");
    try {
      const updated = await updateCustomerArrival(selected.id, status, expectedTime);
      const hydrated = await hydrateConversation(updated, selected.hotelRecord);
      setConversations((current) => current.map((item) => (
        String(item.id) === String(hydrated.id) ? { ...item, ...hydrated } : item
      )));
      await loadMessages(selected.id, { quiet: true });
    } catch (requestError) {
      setError(errorText(requestError, "Không thể cập nhật kế hoạch nhận phòng."));
    } finally {
      setActionBusy(false);
    }
  }

  async function requestLateCheckout() {
    if (!selected?.bookingId || actionBusy) return;
    setActionBusy(true);
    setError("");
    try {
      await requestCustomerLateCheckout(
        selected.id,
        lateCheckoutTime,
        lateCheckoutNote,
      );
      setLateCheckoutNote("");
      await loadMessages(selected.id, { quiet: true });
    } catch (requestError) {
      setError(errorText(requestError, "Không thể gửi yêu cầu trả phòng muộn."));
    } finally {
      setActionBusy(false);
    }
  }

  async function toggleTakeover() {
    if (!selected || customerMode || actionBusy) return;
    setActionBusy(true);
    setError("");
    try {
      const updated = await setHotelAdminHumanTakeover(selected.id, !selected.humanTakeover);
      const hydrated = await hydrateConversation(updated, selected.hotelRecord);
      setConversations((current) => current.map((item) => (
        String(item.id) === String(hydrated.id) ? { ...item, ...hydrated } : item
      )));
      await loadMessages(selected.id, { quiet: true });
    } catch (requestError) {
      setError(errorText(requestError, "Không thể đổi chế độ hỗ trợ."));
    } finally {
      setActionBusy(false);
    }
  }

  if (!enabled || isAiOpen) return null;

  const recipientName = customerMode
    ? selected?.hotelName ?? "Khách sạn"
    : selected?.customerName ?? "Khách hàng";
  const recipientAvatar = customerMode
    ? selected?.hotelAvatarUrl
    : selected?.customerAvatarUrl;
  const recipientKind = customerMode ? "hotel" : "person";

  return (
    <div className={`enziu-chat-root ${customerMode ? "customer" : "hotel-admin"}`}>
      {open ? (
        <section
          ref={panelRef}
          className="enziu-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-label={view === "list" ? "Danh sách hội thoại" : `Hội thoại với ${recipientName}`}
          tabIndex={-1}
        >
          {view === "list" ? (
            <>
              <header className="enziu-chat-panel-header list-header">
                <div className="enziu-chat-header-identity">
                  <span className="enziu-chat-brand-mark"><MessageCircle size={20} /></span>
                  <div className="enziu-chat-header-copy">
                    <h2>{customerMode ? "Tin nhắn khách sạn" : "Tin nhắn khách hàng"}</h2>
                    <p>{realtimeStatus === "connected" ? "Tin nhắn được cập nhật trực tiếp" : "Đang kết nối lại..."}</p>
                  </div>
                </div>
                <div className="enziu-chat-header-actions">
                  <button type="button" onClick={() => setOpen(false)} aria-label="Thu nhỏ hộp chat">
                    <Minus size={19} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setSearch("");
                    }}
                    aria-label="Đóng hộp chat"
                  >
                    <X size={19} />
                  </button>
                </div>
              </header>

              <div className="enziu-chat-search-row">
                <label>
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={customerMode ? "Tìm khách sạn..." : "Tìm khách hoặc khách sạn..."}
                    aria-label="Tìm hội thoại"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadConversations()}
                  disabled={loading}
                  aria-label="Làm mới hội thoại"
                >
                  <RefreshCw size={16} className={loading ? "spin" : ""} />
                </button>
              </div>

              {!customerMode && hotelOptions.length > 1 ? (
                <label className="enziu-chat-hotel-filter">
                  <Hotel size={14} />
                  <span className="sr-only">Lọc theo khách sạn</span>
                  <select value={hotelFilter} onChange={(event) => setHotelFilter(event.target.value)}>
                    <option value="ALL">Tất cả khách sạn</option>
                    {hotelOptions.map((hotel) => (
                      <option value={hotel.id} key={hotel.id}>{hotel.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="enziu-chat-conversation-list">
                {loading ? (
                  <div className="enziu-chat-state"><LoaderCircle className="spin" /> Đang tải hội thoại...</div>
                ) : error && conversations.length === 0 ? (
                  <div className="enziu-chat-state error" role="alert">
                    <MessageCircle />
                    <strong>Chưa thể mở hộp chat</strong>
                    <span>{error}</span>
                    <button type="button" onClick={() => void loadConversations()}>Thử lại</button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="enziu-chat-state">
                    <MessageCircle />
                    <strong>{search ? "Không tìm thấy hội thoại" : "Chưa có cuộc trò chuyện"}</strong>
                    <span>{customerMode
                      ? "Bạn có thể bắt đầu từ trang chi tiết khách sạn hoặc đơn đặt phòng."
                      : "Hội thoại sẽ xuất hiện khi khách nhắn cho khách sạn của bạn."}</span>
                  </div>
                ) : filtered.map((item) => {
                  const name = customerMode ? item.hotelName : item.customerName;
                  const avatar = customerMode ? item.hotelAvatarUrl : item.customerAvatarUrl;
                  return (
                    <button
                      type="button"
                      className="enziu-chat-conversation"
                      key={item.id}
                      onClick={() => openThread(item.id)}
                    >
                      <div className="enziu-chat-conversation-avatar">
                        <Avatar source={avatar} name={name} kind={customerMode ? "hotel" : "person"} />
                        {Number(item.unreadCount ?? 0) > 0 ? (
                          <span className="enziu-chat-item-unread">{Math.min(99, Number(item.unreadCount))}</span>
                        ) : null}
                      </div>
                      <div className="enziu-chat-conversation-copy">
                        <div>
                          <strong>{name}</strong>
                          <time>{formatConversationTime(item.lastMessageAt)}</time>
                        </div>
                        {!customerMode ? <small><Hotel size={11} /> {item.hotelName}</small> : null}
                        <p className={Number(item.unreadCount ?? 0) > 0 ? "unread" : ""}>
                          {item.lastMessage || "Cuộc trò chuyện mới"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <header className="enziu-chat-panel-header thread-header">
                <button type="button" onClick={() => setView("list")} aria-label="Quay lại danh sách hội thoại">
                  <ArrowLeft size={20} />
                </button>
                <div className="enziu-chat-header-identity">
                  <Avatar source={recipientAvatar} name={recipientName} kind={recipientKind} className="header-avatar" />
                  <div className="enziu-chat-header-copy">
                    <h2>{recipientName}</h2>
                    <p>{customerMode
                      ? (selected?.humanTakeover ? "Nhân viên khách sạn đang hỗ trợ" : "Hỗ trợ trực tiếp và tự động")
                      : selected?.hotelName ?? "Khách sạn"}</p>
                  </div>
                </div>
                <div className="enziu-chat-header-actions">
                  <button type="button" onClick={() => setOpen(false)} aria-label="Thu nhỏ hội thoại"><Minus size={19} /></button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setView("list");
                      setSelectedId("");
                    }}
                    aria-label="Đóng hội thoại"
                  >
                    <X size={19} />
                  </button>
                </div>
              </header>

              {selected?.bookingId ? (
                <div className="enziu-chat-booking-context">
                  <p>Liên quan đến đơn <strong>{selected.bookingCode ?? "đặt phòng hiện tại"}</strong></p>
                  <div><span>Nhận phòng</span><strong>{formatDate(selected.checkIn)} · {formatTime(selected.checkInTime)}</strong></div>
                  <div><span>Trả phòng</span><strong>{formatDate(selected.checkOut)} · {formatTime(selected.checkOutTime)}</strong></div>
                </div>
              ) : null}

              {!customerMode && selected ? (
                <div className="enziu-chat-takeover-row">
                  <div>
                    {selected.humanTakeover ? <Headphones size={16} /> : <Bot size={16} />}
                    <span>{selected.humanTakeover ? "Nhân viên đang tiếp quản" : "Trợ lý tự động đang hỗ trợ"}</span>
                  </div>
                  <button type="button" onClick={() => void toggleTakeover()} disabled={actionBusy}>
                    {selected.humanTakeover ? "Bật lại trợ lý" : "Tiếp quản"}
                  </button>
                </div>
              ) : null}

              <div className="enziu-chat-messages" ref={messagesRef} role="log" aria-live="polite">
                {messagesLoading ? (
                  <div className="enziu-chat-state"><LoaderCircle className="spin" /> Đang tải tin nhắn...</div>
                ) : messages.length === 0 ? (
                  <div className="enziu-chat-state">
                    <MessageCircle />
                    <strong>Bắt đầu cuộc trò chuyện</strong>
                    <span>Gửi một tin nhắn để trao đổi trực tiếp.</span>
                  </div>
                ) : messages.map((message, index) => {
                  const viewerRole = customerMode ? "CUSTOMER" : "HOTEL_ADMIN";
                  const group = getChatMessageGroup(message);
                  const position = getChatMessagePosition(message, viewerRole);
                  const mine = position === CHAT_MESSAGE_POSITION.OUTGOING;
                  const systemEvent = position === CHAT_MESSAGE_POSITION.SYSTEM;
                  const previous = messages[index - 1];
                  const showAvatar = !mine && !isSameChatMessageRun(previous, message, viewerRole);
                  const lastMine = mine && !messages.slice(index + 1).some((next) => (
                    getChatMessagePosition(next, viewerRole) === CHAT_MESSAGE_POSITION.OUTGOING
                  ));
                  const messageFromCustomer = group === CHAT_MESSAGE_GROUP.CUSTOMER;
                  const messageFromHotelAdmin = String(message.senderType ?? "").toUpperCase() === "HOTEL_ADMIN";
                  const messageAvatar = customerMode
                    ? (messageFromHotelAdmin
                      ? selected?.hotelAdminAvatarUrl ?? recipientAvatar
                      : selected?.hotelAvatarUrl ?? recipientAvatar)
                    : (messageFromCustomer
                      ? selected?.customerAvatarUrl ?? recipientAvatar
                      : selected?.hotelAvatarUrl ?? null);
                  const messageName = customerMode
                    ? (messageFromHotelAdmin
                      ? selected?.hotelAdminName ?? recipientName
                      : selected?.hotelName ?? "Khách sạn")
                    : (messageFromCustomer
                      ? selected?.customerName ?? recipientName
                      : selected?.hotelName ?? "Khách sạn");
                  const messageKind = messageFromCustomer || messageFromHotelAdmin ? "person" : "hotel";

                  if (systemEvent) {
                    return (
                      <article className="enziu-chat-system-event" key={message.id} role="note">
                        <span>{message.content}</span>
                        <time>{formatMessageTime(message.createdAt)}</time>
                      </article>
                    );
                  }

                  return (
                    <article className={`enziu-chat-message ${mine ? "mine" : "theirs"}`} key={message.id}>
                      {!mine ? (
                        showAvatar
                          ? <Avatar source={messageAvatar} name={messageName} kind={messageKind} className="message-avatar" />
                          : <span className="enziu-chat-avatar-spacer" />
                      ) : null}
                      <div>
                        <p>{message.content}</p>
                        <footer>
                          <time>{formatMessageTime(message.createdAt)}</time>
                          {mine && message.deliveryState === "sending" ? <span>Đang gửi...</span> : null}
                          {mine && message.deliveryState === "failed" ? (
                            <button type="button" onClick={() => void sendMessage(message.content, message.id)}>Gửi lại</button>
                          ) : null}
                          {lastMine && !message.deliveryState ? (
                            <span className="enziu-chat-delivery">
                              {message.readAt ? <CheckCheck size={13} /> : <Check size={13} />}
                              {message.readAt ? "Đã xem" : "Đã gửi"}
                            </span>
                          ) : null}
                        </footer>
                      </div>
                    </article>
                  );
                })}
              </div>

              {customerMode && selected?.bookingId ? (
                <div className={`enziu-chat-booking-tools ${bookingToolsOpen ? "open" : ""}`}>
                  <button type="button" onClick={() => setBookingToolsOpen((current) => !current)} aria-expanded={bookingToolsOpen}>
                    <Clock3 size={15} /> Kế hoạch lưu trú
                    <span>{bookingToolsOpen ? "Ẩn" : "Mở"}</span>
                  </button>
                  {bookingToolsOpen ? (
                    <div className="enziu-chat-booking-tool-body">
                      <div className="enziu-chat-arrival-buttons">
                        <button type="button" disabled={actionBusy} onClick={() => void updateArrival("CONFIRMED")}>Tôi sẽ đến</button>
                        <label>
                          <span>Đến trễ lúc</span>
                          <input type="time" value={expectedArrivalTime} onChange={(event) => setExpectedArrivalTime(event.target.value)} />
                          <button type="button" disabled={actionBusy} onClick={() => void updateArrival("ARRIVING_LATE", expectedArrivalTime)}>Báo đến trễ</button>
                        </label>
                      </div>
                      <div className="enziu-chat-late-checkout">
                        <label><span>Xin trả phòng lúc</span><input type="time" value={lateCheckoutTime} onChange={(event) => setLateCheckoutTime(event.target.value)} /></label>
                        <input value={lateCheckoutNote} onChange={(event) => setLateCheckoutNote(event.target.value)} maxLength={240} placeholder="Ghi chú (không bắt buộc)" />
                        <button type="button" disabled={actionBusy} onClick={() => void requestLateCheckout()}>Gửi yêu cầu</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <div className="enziu-chat-inline-error" role="alert">{error}</div> : null}

              <form className="enziu-chat-composer" onSubmit={submitMessage}>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitMessage(event);
                    }
                  }}
                  rows={1}
                  maxLength={1200}
                  placeholder={customerMode ? "Nhắn tin cho khách sạn..." : "Nhắn tin cho khách..."}
                  aria-label="Nội dung tin nhắn"
                  disabled={!selected || sending}
                />
                <button type="submit" disabled={!selected || sending || !input.trim()} aria-label="Gửi tin nhắn">
                  {sending ? <LoaderCircle size={19} className="spin" /> : <Send size={19} />}
                </button>
              </form>
            </>
          )}
        </section>
      ) : null}

      <button
        type="button"
        className={`enziu-chat-launcher ${open ? "open" : ""}`}
        onClick={() => {
          if (!open) window.dispatchEvent(new CustomEvent("enziu:ai-close"));
          setOpen((current) => !current);
          if (!open) void loadConversations({ quiet: conversations.length > 0 });
        }}
        aria-label={open ? "Thu nhỏ hộp chat" : "Mở hộp chat"}
        aria-expanded={open}
      >
        {open ? <Minus size={22} /> : <MessageCircle size={24} />}
        {!open ? <span>Tin nhắn</span> : null}
        {!open && totalUnread > 0 ? <b>{Math.min(99, totalUnread)}</b> : null}
      </button>
    </div>
  );
}
