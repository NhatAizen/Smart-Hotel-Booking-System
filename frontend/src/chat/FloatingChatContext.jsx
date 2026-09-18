import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const FloatingChatContext = createContext(null);

export function FloatingChatProvider({ children }) {
  const [directRequest, setDirectRequest] = useState(null);

  const openHotelConversation = useCallback(({ hotel = null, booking = null } = {}) => {
    const hotelId = hotel?.id ?? booking?.hotelId ?? null;
    const bookingId = booking?.id ?? null;
    if (!hotelId && !bookingId) return;

    setDirectRequest({
      id: `${bookingId ?? hotelId}-${Date.now()}`,
      hotel,
      booking,
    });
  }, []);

  const clearDirectRequest = useCallback((requestId) => {
    setDirectRequest((current) => (
      current?.id === requestId ? null : current
    ));
  }, []);

  const value = useMemo(() => ({
    directRequest,
    openHotelConversation,
    clearDirectRequest,
  }), [clearDirectRequest, directRequest, openHotelConversation]);

  return (
    <FloatingChatContext.Provider value={value}>
      {children}
    </FloatingChatContext.Provider>
  );
}

export function useFloatingChat() {
  const context = useContext(FloatingChatContext);
  if (!context) {
    throw new Error("useFloatingChat phải được dùng trong FloatingChatProvider");
  }
  return context;
}
