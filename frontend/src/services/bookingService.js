import apiClient from "../api/apiClient";

export async function createBooking(payload) {
  const response = await apiClient.post("/bookings", payload);
  return response.data;
}

export async function createBookingsBatch(payload) {
  const response = await apiClient.post("/bookings/batch", payload);
  return response.data;
}

export async function getBooking(bookingId) {
  const response = await apiClient.get(`/bookings/${bookingId}`);
  return response.data;
}

export async function getBookingQrBlob(bookingId) {
  const response = await apiClient.get(`/bookings/${bookingId}/qr`, {
    responseType: "blob",
  });
  return response.data;
}

export async function getMyBookings(customerId) {
  if (!customerId) return [];
  const response = await apiClient.get(`/customers/${customerId}/bookings`);
  return response.data;
}

export async function cancelBooking(bookingId) {
  const response = await apiClient.patch(`/bookings/${bookingId}/cancel`);
  return response.data;
}

export async function getHotelAvailability(
  hotelId,
  checkIn,
  checkOut,
  holdToken = null,
) {
  if (!hotelId || !checkIn || !checkOut) {
    return { hotelId, checkIn, checkOut, unavailableRoomIds: [], heldRooms: [] };
  }

  const response = await apiClient.get(`/availability/hotels/${hotelId}`, {
    params: { checkIn, checkOut, ...(holdToken ? { holdToken } : {}) },
  });
  return response.data;
}

export async function getHotelAvailabilityCalendar(hotelId, from, to) {
  if (!hotelId || !from || !to) {
    return {
      hotelId,
      from,
      to,
      rooms: [],
      bookings: [],
      holds: [],
    };
  }

  const response = await apiClient.get(
    `/hotel-admin/hotels/${hotelId}/availability-calendar`,
    { params: { from, to } },
  );
  return response.data;
}

export async function createRoomHold(payload) {
  const response = await apiClient.post("/availability/holds", payload);
  return response.data;
}

export async function getHotelReviews(hotelId) {
  const response = await apiClient.get(`/reviews/hotels/${hotelId}`);
  return response.data;
}

export async function getHotelReviewSummary(hotelId) {
  const response = await apiClient.get(`/reviews/hotels/${hotelId}/summary`);
  return response.data;
}

export async function getMyReviews() {
  const response = await apiClient.get("/reviews/me");
  return response.data;
}

export async function getReviewByBooking(bookingId) {
  const response = await apiClient.get(`/reviews/bookings/${bookingId}`);
  return response.data;
}

export async function createHotelReview(payload, images = []) {
  const formData = new FormData();
  formData.append(
    "review",
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
  );

  images.forEach((file) => {
    formData.append("images", file);
  });

  const response = await apiClient.post("/reviews", formData);
  return response.data;
}

export async function verifyCheckInCode(code) {
  const response = await apiClient.post("/bookings/check-in/verify", { code });
  return response.data;
}

export async function verifyCheckInIdentity(bookingId, code, identityQrData) {
  const response = await apiClient.post(
    `/bookings/${bookingId}/check-in/verify-identity`,
    { code, identityQrData },
  );
  return response.data;
}

export async function verifyCheckInIdentityManual(bookingId, code) {
  const response = await apiClient.post(
    `/bookings/${bookingId}/check-in/verify-identity-manual`,
    { code },
  );
  return response.data;
}

export async function collectBookingPaymentAtHotel(bookingId, code) {
  const response = await apiClient.post(
    `/bookings/${bookingId}/check-in/collect-at-hotel`,
    { code },
  );
  return response.data;
}

export async function completeBookingCheckIn(bookingId, code) {
  const response = await apiClient.post(
    `/bookings/${bookingId}/check-in/complete`,
    { code },
  );
  return response.data;
}

export async function hideBookingFromCustomer(bookingId) {
  const response = await apiClient.patch(`/bookings/${bookingId}/hide`);
  return response.data;
}

export async function getHotelBookings(hotelId) {
  if (!hotelId) return [];
  const response = await apiClient.get(`/hotels/${hotelId}/bookings`);
  return response.data;
}

export async function getCurrentHotelStays() {
  const response = await apiClient.get("/bookings/current-stays");
  return response.data;
}

export async function checkOutBooking(bookingId) {
  const response = await apiClient.patch(`/bookings/${bookingId}/check-out`);
  return response.data;
}

export async function getBookingPricingQuote(payload) {
  const response = await apiClient.post("/pricing/quote", payload);
  return response.data;
}

export async function assessLateCheckoutFee(bookingId) {
  const response = await apiClient.post(`/bookings/${bookingId}/late-checkout/assess`);
  return response.data;
}


export function subscribeHotelAvailability(
  hotelId,
  onAvailability,
  { onConnected, onError } = {},
) {
  if (!hotelId || typeof EventSource === "undefined") {
    return () => {};
  }

  const apiBase =
    import.meta.env.VITE_API_BASE_URL ??
    "http://localhost:8080/api";
  const url = `${apiBase.replace(/\/$/, "")}/availability/stream/hotels/${hotelId}`;
  const source = new EventSource(url);

  source.addEventListener("connected", () => {
    onConnected?.();
  });

  source.addEventListener("availability", (event) => {
    try {
      onAvailability?.(JSON.parse(event.data));
    } catch {
      // Bỏ qua event lỗi định dạng; EventSource vẫn tiếp tục kết nối.
    }
  });

  source.onerror = () => {
    onError?.();
  };

  return () => source.close();
}

export async function markBookingNoShow(bookingId) {
  const response = await apiClient.patch(`/bookings/${bookingId}/no-show`);
  return response.data;
}

/* =========================================================
   HOTEL REVIEW REPLY / SYSTEM MODERATION
========================================================= */

export async function getHotelAdminReviews() {
  const response = await apiClient.get("/hotel-admin/reviews");
  return response.data;
}

export async function createHotelReviewReply(reviewId, content) {
  const response = await apiClient.post(
    `/hotel-admin/reviews/${reviewId}/reply`,
    { content },
  );
  return response.data;
}

export async function updateHotelReviewReply(reviewId, content) {
  const response = await apiClient.put(
    `/hotel-admin/reviews/${reviewId}/reply`,
    { content },
  );
  return response.data;
}

export async function deleteHotelReviewReply(reviewId) {
  const response = await apiClient.delete(
    `/hotel-admin/reviews/${reviewId}/reply`,
  );
  return response.data;
}

export async function getSystemAdminReviews(params = {}) {
  const response = await apiClient.get("/admin/reviews", { params });
  return response.data;
}

export async function hideSystemAdminReview(reviewId, reason) {
  const response = await apiClient.patch(
    `/admin/reviews/${reviewId}/hide`,
    { reason },
  );
  return response.data;
}

export async function restoreSystemAdminReview(reviewId) {
  const response = await apiClient.patch(
    `/admin/reviews/${reviewId}/restore`,
  );
  return response.data;
}

/* =========================================================
   ROOM CHANGE REQUESTS / BOOKING MANAGEMENT
========================================================= */

export async function createRoomChangeRequest(bookingId, targetRoomId, reason) {
  const response = await apiClient.post(
    `/bookings/${bookingId}/room-change-requests`,
    { targetRoomId, reason },
  );
  return response.data;
}

export async function getMyRoomChangeRequests() {
  const response = await apiClient.get("/bookings/room-change-requests/me");
  return response.data;
}

export async function getHotelRoomChangeRequests(hotelId) {
  if (!hotelId) return [];
  const response = await apiClient.get("/bookings/room-change-requests/hotel", {
    params: { hotelId },
  });
  return response.data;
}

export async function getRoomChangeQuote(requestId) {
  const response = await apiClient.get(
    `/bookings/room-change-requests/${requestId}/quote`,
  );
  return response.data;
}

export async function approveRoomChangeRequest(requestId, note = "") {
  const response = await apiClient.patch(
    `/bookings/room-change-requests/${requestId}/approve`,
    { note },
  );
  return response.data;
}

export async function rejectRoomChangeRequest(requestId, note = "") {
  const response = await apiClient.patch(
    `/bookings/room-change-requests/${requestId}/reject`,
    { note },
  );
  return response.data;
}

export async function getSystemBookings(status = "") {
  const response = await apiClient.get("/bookings/admin/all", {
    params: status ? { status } : undefined,
  });
  return response.data;
}
