import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { askEnziuAssistant } from "../services/aiService";

export const AI_QUICK_PROMPTS = [
  "Tìm khách sạn cho 2 người, ưu tiên review tốt",
  "Booking sắp tới của tôi là khi nào?",
  "Tôi còn phải thanh toán bao nhiêu?",
  "QR check-in hoạt động như thế nào?",
];

const INITIAL_MESSAGE = {
  role: "assistant",
  content:
    "Chào bạn, mình là Enziu AI. Mình có thể tìm và so sánh khách sạn bằng dữ liệu thật, tóm tắt review hoặc kiểm tra booking của chính bạn. Bạn muốn hỏi gì?",
  hotels: [],
  bookings: [],
  suggestedPrompts: AI_QUICK_PROMPTS,
};

const AiAssistantContext = createContext(null);

export function AiAssistantProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [trip, setTrip] = useState({
    checkIn: "",
    checkOut: "",
    adults: 2,
    children: 0,
  });
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

  const updateTrip = useCallback((field, value) => {
    setTrip((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const openAssistant = useCallback((options = {}) => {
    const {
      hotelId,
      hotelName,
      checkIn,
      checkOut,
      adults,
      children,
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

    setTrip((current) => ({
      checkIn: checkIn !== undefined ? checkIn : current.checkIn,
      checkOut: checkOut !== undefined ? checkOut : current.checkOut,
      adults:
        adults !== undefined && adults !== ""
          ? Number(adults) || 1
          : current.adults,
      children:
        children !== undefined && children !== ""
          ? Number(children) || 0
          : current.children,
    }));

    if (openTrip) {
      setTripOpen(true);
    }

    setError("");
    setIsOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleAssistant = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const clearHotelContext = useCallback(() => {
    setContextualHotel(null);
  }, []);

  const resetConversation = useCallback(() => {
    setMessages([INITIAL_MESSAGE]);
    setQuestion("");
    setError("");
  }, []);

  const sendQuestion = useCallback(
    async (rawQuestion) => {
      const currentQuestion = String(rawQuestion ?? question).trim();
      if (!currentQuestion || sending) return;

      const history = messages
        .slice(-6)
        .map((item) => ({
          role: item.role,
          content: item.content,
        }));

      setMessages((current) => [
        ...current,
        {
          role: "user",
          content: currentQuestion,
        },
      ]);
      setQuestion("");
      setSending(true);
      setError("");

      try {
        const response = await askEnziuAssistant({
          message: currentQuestion,
          checkIn: trip.checkIn || null,
          checkOut: trip.checkOut || null,
          adults: Number(trip.adults) || 1,
          children: Number(trip.children) || 0,
          hotelId: contextualHotel?.id || null,
          history,
        });

        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content:
              response.answer || "Mình chưa nhận được nội dung trả lời.",
            hotels: response.hotels ?? [],
            bookings: response.bookings ?? [],
            context: response.context ?? null,
            intent: response.intent,
            suggestedPrompts: response.suggestedPrompts ?? [],
          },
        ]);
      } catch (requestError) {
        setError(
          requestError.response?.data?.message
            ?? requestError.response?.data?.error
            ?? "Không thể kết nối Enziu AI. Hãy kiểm tra AI Service và Gemini API.",
        );
      } finally {
        setSending(false);
      }
    },
    [contextualHotel, messages, question, sending, trip],
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
