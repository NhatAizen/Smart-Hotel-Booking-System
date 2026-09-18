import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { askEnziuAssistant } from "../services/aiService";
import { friendlyErrorMessage } from "../utils/userFacingText";

export const AI_QUICK_PROMPTS = [
  "Tôi đi cùng gia đình, nên chọn phòng nào?",
  "Tìm khách sạn phù hợp ngân sách của tôi",
  "So sánh các lựa chọn vừa nói giúp tôi",
  "Đơn đặt phòng sắp tới của tôi thế nào?",
];

const INITIAL_MESSAGE = {
  role: "assistant",
  content:
    "Chào bạn, mình là Enziu AI. Bạn cứ nói nhu cầu của mình; " +
    "mình sẽ giúp tìm khách sạn, so sánh phòng, giá và các ưu đãi phù hợp.",
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
    .slice(-10)
    .map((message) => ({
      role: message?.role === "user" ? "user" : "assistant",
      content: String(message?.content ?? "").trim(),
    }))
    .filter((message) => message.content);
}

function searchAgentContext(response, previousMessages, contextualHotel) {
  const top = Array.isArray(response?.hotels) ? response.hotels[0] : null;
  const previous = [...(previousMessages ?? [])]
    .reverse()
    .find((message) => message?.agentContext)?.agentContext ?? null;

  return {
    currentHotelId:
      contextualHotel?.id ??
      top?.hotelId ??
      top?.id ??
      previous?.currentHotelId ??
      null,
    currentHotelName:
      contextualHotel?.name ??
      top?.name ??
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
  const [isOpen, setIsOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [trip, setTrip] = useState(readStoredTrip);
  const tripRef = useRef(trip);
  const [contextualHotel, setContextualHotel] = useState(null);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const latestSuggestions = useMemo(() => {
    const latestAssistant = [...messages]
      .reverse()
      .find((item) => item.role === "assistant");

    return latestAssistant?.suggestedPrompts?.length
      ? latestAssistant.suggestedPrompts
      : AI_QUICK_PROMPTS;
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
  const clearHotelContext = useCallback(() => setContextualHotel(null), []);
  const resetConversation = useCallback(() => {
    setMessages([INITIAL_MESSAGE]);
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
        /*
         * Booking Agent đi trước assistant chung.
         * Nó dùng Gemini để hiểu NGỮ NGHĨA và tự chọn dữ liệu cần lấy,
         * không ép người dùng nói đúng regex/form câu hỏi.
         */
        const { runBookingAgent } = await import("./bookingAgent");
        const agentResponse = await runBookingAgent({
          question: currentQuestion,
          messages: currentMessages,
          trip: activeTrip,
          contextualHotel,
        });

        if (agentResponse) {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              content:
                agentResponse.answer ||
                "Mình chưa nhận được nội dung trả lời.",
              hotels: agentResponse.hotels ?? [],
              bookings: agentResponse.bookings ?? [],
              context: agentResponse.context ?? null,
              intent: agentResponse.intent ?? "BOOKING_AGENT",
              copilot: agentResponse.copilot ?? null,
              agentContext: agentResponse.agentContext ?? null,
              suggestedPrompts: agentResponse.suggestedPrompts ?? [],
            },
          ]);
          return;
        }

        /*
         * Tìm khách sạn, booking, policy và câu hỏi chung
         * vẫn dùng AI Service hiện có vì backend đã có tool/data cho các luồng đó.
         */
        const response = await askEnziuAssistant({
          message: currentQuestion,
          userMessage: currentQuestion,
          checkIn: activeTrip.checkIn || null,
          checkOut: activeTrip.checkOut || null,
          adults: Number(activeTrip.adults) || 1,
          children: Number(activeTrip.children) || 0,
          hotelId: contextualHotel?.id || null,
          history,
        });

        const { enhanceAssistantResponse } = await import("./bookingCopilotEnhancer");
        const enhanced = await enhanceAssistantResponse({
          question: currentQuestion,
          response,
          trip: activeTrip,
        });

        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content:
              enhanced.answer ||
              "Mình chưa nhận được nội dung trả lời.",
            hotels: enhanced.hotels ?? [],
            bookings: enhanced.bookings ?? [],
            context: enhanced.context ?? null,
            intent: enhanced.intent ?? null,
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
    [contextualHotel, messages, question, sending],
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
      contextualHotel,
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
