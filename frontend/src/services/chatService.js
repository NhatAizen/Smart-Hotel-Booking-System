import apiClient from "../api/apiClient";

export async function ensureBookingConversation(bookingId) {
  const response = await apiClient.post(`/chat/bookings/${bookingId}/conversation`);
  return response.data;
}

export async function ensureHotelConversation(hotelId) {
  const response = await apiClient.post(`/chat/hotels/${hotelId}/conversation`);
  return response.data;
}

export async function getCustomerConversations() {
  const response = await apiClient.get("/chat/conversations");
  return Array.isArray(response.data) ? response.data : [];
}

export async function getCustomerChatMessages(conversationId) {
  const response = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
  return Array.isArray(response.data) ? response.data : [];
}

export async function sendCustomerChatMessage(conversationId, content) {
  const response = await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
    content,
  });
  return response.data;
}

export async function markCustomerChatRead(conversationId) {
  const response = await apiClient.patch(`/chat/conversations/${conversationId}/read`);
  return response.data;
}

export async function updateCustomerArrival(conversationId, status, expectedArrivalTime = null) {
  const response = await apiClient.post(`/chat/conversations/${conversationId}/arrival`, {
    status,
    expectedArrivalTime,
  });
  return response.data;
}

export async function requestCustomerLateCheckout(
  conversationId,
  requestedCheckoutTime,
  note = "",
) {
  const response = await apiClient.post(
    `/chat/conversations/${conversationId}/late-checkout-request`,
    {
      requestedCheckoutTime,
      note: note.trim() || null,
    },
  );
  return response.data;
}

export async function getHotelAdminChatConversations() {
  const response = await apiClient.get("/hotel-admin/chat/conversations");
  return Array.isArray(response.data) ? response.data : [];
}

export async function getHotelAdminChatMessages(conversationId) {
  const response = await apiClient.get(
    `/hotel-admin/chat/conversations/${conversationId}/messages`,
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function sendHotelAdminChatMessage(conversationId, content) {
  const response = await apiClient.post(
    `/hotel-admin/chat/conversations/${conversationId}/messages`,
    { content },
  );
  return response.data;
}

export async function markHotelAdminChatRead(conversationId) {
  const response = await apiClient.patch(
    `/hotel-admin/chat/conversations/${conversationId}/read`,
  );
  return response.data;
}

export async function setHotelAdminHumanTakeover(conversationId, humanTakeover) {
  const response = await apiClient.patch(
    `/hotel-admin/chat/conversations/${conversationId}/takeover`,
    { humanTakeover },
  );
  return response.data;
}
