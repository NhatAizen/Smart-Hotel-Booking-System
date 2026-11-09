import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { getHotelById } from "../services/hotelService";
import { useLocation } from "react-router-dom";
import { askEnziuAssistant } from "../services/aiService";
import { friendlyErrorMessage } from "../utils/userFacingText";
import { tripFromAssistant, buildAssistantConversationContext, assistantSuggestions, assistantHotelFocus } from "./assistantPresentation";

export const AI_QUICK_PROMPTS = [
  "Phòng nào phù hợp nhất với tôi?",
  "Tìm khách sạn phù hợp ngân sách của tôi",
  "So sánh các lựa chọn vừa nói giúp tôi",
  "Đơn đặt phòng sắp tới của tôi thế nào?",
];

const INITIAL_MESSAGE = {
  role: "assistant",
  content:
    "Bạn cần chọn phòng hay có câu hỏi về chuyến đi? Tôi sẽ đối chiếu thông tin trong EnziuRooms để giúp bạn.",
  hotels: [],
  bookings: [],
  suggestedPrompts: AI_QUICK_PROMPTS,
  agentContext: null,
};

const TRIP_STORAGE_KEY = "enziu.ai.trip.v1";
const DEFAULT_TRIP = {
  checkIn: "",
  checkOut: "",
  adults: 2,
  children: 0,
};

function readStoredTrip() {
  if (typeof window === "undefined") return DEFAULT_TRIP;

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(TRIP_STORAGE_KEY) || "null",
    );

    if (!parsed || typeof parsed !== "object") return DEFAULT_TRIP;

    return {
      checkIn: typeof parsed.checkIn === "string" ? parsed.checkIn : "",
      checkOut: typeof parsed.checkOut === "string" ? parsed.checkOut : "",
      adults: Math.max(1, Number(parsed.adults) || 2),
      children: Math.max(0, Number(parsed.children) || 0),
    };
  } catch {
    return DEFAULT_TRIP;
  }
}

function persistTrip(nextTrip) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(nextTrip));
  } catch {
    // State trong phiên vẫn hoạt động nếu trình duyệt chặn localStorage.
  }
}

function buildHistory(messages) {
  return (messages ?? [])
    .slice(-8)
    .map((message) => ({
      role: message?.role === "user" ? "user" : "assistant",
      content: String(message?.content ?? "").trim().slice(0, 2000),
    }))
    .filter((message) => message.content);
}

function searchAgentContext(response, previousMessages, contextualHotel) {
  if (response?.intent === "RECOMMEND_HOTELS") {
    const focus = assistantHotelFocus(response);
    return { currentHotelId: focus?.id ?? null, currentHotelName: focus?.name ?? null, lastGoal: "hotel search" };
  }
  if (response?.intent === "COMPARE_HOTELS" && response.hotels?.length > 1) {
    return { currentHotelId: null, currentHotelName: null, lastGoal: "hotel comparison" };
  }
  const top = response?.rooms?.[0] ?? (response?.intent === "HOTEL_DETAILS" ? response?.hotels?.[0] : null) ?? null;
  const previous = [...(previousMessages ?? [])]
    .reverse()
    .find((message) => message?.agentContext)?.agentContext ?? null;

  return {
    currentHotelId:
      top?.hotelId ??
      contextualHotel?.id ??
      top?.id ??
      previous?.currentHotelId ??
      null,
    currentHotelName:
      top?.hotelName ??
      top?.name ??
      contextualHotel?.name ??
      previous?.currentHotelName ??
      null,
    roomCandidates: top ? [] : previous?.roomCandidates ?? [],
    preferences: previous?.preferences ?? [],
    entities: previous?.entities ?? {},
    lastGoal: top ? "hotel search" : previous?.lastGoal ?? "hotel search",
  };
}

const AiAssistantContext = createContext(null);

export function AiAssistantProvider({ children }) {
  const location = useLocation();
  const routeHotelId = location.pathname.match(/^\/hotels\/([0-9a-f-]{36})(?:\/|$)/i)?.[1] ?? null;
  const [clearedPageHotel, setClearedPageHotel] = useState(null);
  const pageHotelId = clearedPageHotel === routeHotelId ? null : routeHotelId;
  const [activeHotelName, setActiveHotelName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [trip, setTrip] = useState(readStoredTrip);
  const tripRef = useRef(trip);
  const [contextualHotel, setContextualHotel] = useState(null);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setActiveHotelName("");
    setContextualHotel(null);
    if (pageHotelId) {
      getHotelById(pageHotelId).then((hotel) => {
        if (active) setActiveHotelName(hotel?.name || "Khách sạn đang xem");
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [pageHotelId]);

  const latestSuggestions = useMemo(() => {
    const latestAssistant = [...messages]
      .reverse()
      .find((item) => item.role === "assistant");

    return assistantSuggestions(latestAssistant, AI_QUICK_PROMPTS);
  }, [messages]);

  const latestUserQuestion = useMemo(() => {
    const latestUser = [...messages]
      .reverse()
      .find(
        (item) =>
          item.role === "user" &&
          String(item.content ?? "").trim(),
      );

    return latestUser?.content ?? "";
  }, [messages]);

  const updateTrip = useCallback((field, value) => {
    const current = tripRef.current;
    const normalizedValue =
      field === "adults"
        ? Math.max(1, Number(value) || 1)
        : field === "children"
          ? Math.max(0, Number(value) || 0)
          : String(value ?? "");

    const next = {
      ...current,
      [field]: normalizedValue,
    };

    if (
      field === "checkIn" &&
      next.checkOut &&
      normalizedValue &&
      next.checkOut <= normalizedValue
    ) {
      next.checkOut = "";
    }

    tripRef.current = next;
    setTrip(next);
    persistTrip(next);
  }, []);

  const openAssistant = useCallback((options = {}) => {
    const {
      hotelId,
      hotelName,
      checkIn,
      checkOut,
      adults,
      children: optionChildren,
      openTrip = false,
    } = options;

    if (hotelId !== undefined && hotelId !== null && hotelId !== "") {
      setClearedPageHotel(null);
      setContextualHotel({
        id: String(hotelId),
        name: hotelName || "Khách sạn đang xem",
      });
    } else if (options.clearHotelContext) {
      setContextualHotel(null);
    }

    const currentTrip = tripRef.current;
    const nextTrip = {
      checkIn:
        checkIn !== undefined ? String(checkIn ?? "") : currentTrip.checkIn,
      checkOut:
        checkOut !== undefined ? String(checkOut ?? "") : currentTrip.checkOut,
      adults:
        adults !== undefined && adults !== ""
          ? Math.max(1, Number(adults) || 1)
          : currentTrip.adults,
      children:
        optionChildren !== undefined && optionChildren !== ""
          ? Math.max(0, Number(optionChildren) || 0)
          : currentTrip.children,
    };

    tripRef.current = nextTrip;
    setTrip(nextTrip);
    persistTrip(nextTrip);

    if (openTrip) setTripOpen(true);
    setError("");
    setIsOpen(true);
  }, []);

  const closeAssistant = useCallback(() => setIsOpen(false), []);
  const toggleAssistant = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);
  const clearHotelContext = useCallback(() => {
    setContextualHotel(null);
    setClearedPageHotel(routeHotelId);
    setMessages((current) => current.map((message) => ({ ...message, agentContext: null })));
  }, [routeHotelId]);
  const resetConversation = useCallback(() => {
    setMessages([INITIAL_MESSAGE]);
    setTripOpen(false);
    setQuestion("");
    setError("");
  }, []);

  const sendQuestion = useCallback(
    async (rawQuestion) => {
      const currentQuestion = String(rawQuestion ?? question).trim();
      if (!currentQuestion || sending) return;

      const activeTrip = tripRef.current;
      const currentMessages = messages;
      const history = buildHistory(currentMessages);

      setMessages((current) => [
        ...current,
        { role: "user", content: currentQuestion },
      ]);
      setQuestion("");
      setSending(true);
      setError("");

      try {
        // Intent recognition and answers use the internal EnziuRooms service.
        const response = await askEnziuAssistant({
          message: currentQuestion,
          checkIn: activeTrip.checkIn || null,
          checkOut: activeTrip.checkOut || null,
          adults: Number(activeTrip.adults) || 1,
          children: Number(activeTrip.children) || 0,
          hotelId: contextualHotel?.id || pageHotelId || searchAgentContext(null, currentMessages, null).currentHotelId || null,
          conversationContext: buildAssistantConversationContext(currentMessages),
          history,
        });

        const focusedResult = response.rooms?.[0] ?? (response.intent === "HOTEL_DETAILS" ? response.hotels?.[0] : null);
        if (response.intent === "RECOMMEND_HOTELS") {
          setContextualHotel(null);
          setClearedPageHotel(routeHotelId);
        }
        if (focusedResult?.hotelId) {
          setContextualHotel({ id: focusedResult.hotelId, name: focusedResult.hotelName || focusedResult.name });
        }
        const resolvedTrip = tripFromAssistant(activeTrip, response.context);
        tripRef.current = resolvedTrip;
        setTrip(resolvedTrip);
        persistTrip(resolvedTrip);

        const { enhanceAssistantResponse } = await import("./bookingCopilotEnhancer");
        const enhanced = await enhanceAssistantResponse({
          question: currentQuestion,
          response,
          trip: resolvedTrip,
        });

        const visibleFocus = assistantHotelFocus(enhanced);
        if (enhanced.intent === "RECOMMEND_HOTELS") {
          setContextualHotel(visibleFocus);
          setClearedPageHotel(routeHotelId);
        } else if (enhanced.intent === "COMPARE_HOTELS" && enhanced.hotels?.length > 1) {
          setContextualHotel(null);
          setClearedPageHotel(routeHotelId);
        } else if (visibleFocus) {
          setContextualHotel(visibleFocus);
        }

        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content:
              enhanced.answer ||
              "Mình chưa nhận được nội dung trả lời.",
            hotels: enhanced.hotels ?? [],
            comparison: enhanced.comparison ?? null,
            directions: enhanced.directions ?? null,
            rooms: enhanced.rooms ?? [],
            bookings: enhanced.bookings ?? [],
            context: enhanced.context ?? null,
            intent: enhanced.intent ?? null,
            conversationAction: enhanced.conversationAction ?? "NONE",
            model: enhanced.model ?? null,
            engine: enhanced.engine ?? null,
            copilot: enhanced.copilot ?? null,
            agentContext: searchAgentContext(
              enhanced,
              currentMessages,
              contextualHotel,
            ),
            suggestedPrompts: enhanced.suggestedPrompts ?? [],
          },
        ]);
      } catch (requestError) {
        setError(
          friendlyErrorMessage(
            requestError,
            "Enziu AI đang tạm thời gián đoạn. Vui lòng thử lại sau.",
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [contextualHotel, messages, pageHotelId, question, routeHotelId, sending],
  );

  const value = useMemo(
    () => ({
      isOpen,
      tripOpen,
      setTripOpen,
      question,
      setQuestion,
      trip,
      updateTrip,
      contextualHotel: contextualHotel || (pageHotelId ? { id: pageHotelId, name: activeHotelName || "Khách sạn đang xem" } : null),
      messages,
      sending,
      error,
      latestSuggestions,
      latestUserQuestion,
      openAssistant,
      closeAssistant,
      toggleAssistant,
      clearHotelContext,
      resetConversation,
      sendQuestion,
    }),
    [
      isOpen,
      tripOpen,
      question,
      trip,
      updateTrip,
      contextualHotel,
      pageHotelId,
      activeHotelName,
      messages,
      sending,
      error,
      latestSuggestions,
      latestUserQuestion,
      openAssistant,
      closeAssistant,
      toggleAssistant,
      clearHotelContext,
      resetConversation,
      sendQuestion,
    ],
  );

  return (
    <AiAssistantContext.Provider value={value}>
      {children}
    </AiAssistantContext.Provider>
  );
}

export function useAiAssistant() {
  const context = useContext(AiAssistantContext);

  if (!context) {
    throw new Error(
      "useAiAssistant phải được dùng bên trong AiAssistantProvider",
    );
  }

  return context;
}
