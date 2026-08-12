import apiClient from "../api/apiClient";

function unwrap(response) {
  return response.data;
}

export async function getPendingPartnerRequests() {
  return unwrap(
    await apiClient.get("/admin/partner-requests", {
      params: { status: "PENDING" },
    }),
  );
}

export async function approvePartnerRequest(requestId) {
  return unwrap(
    await apiClient.patch(
      `/admin/partner-requests/${requestId}/approve`,
    ),
  );
}

export async function rejectPartnerRequest(requestId, reason) {
  return unwrap(
    await apiClient.patch(
      `/admin/partner-requests/${requestId}/reject`,
      { reason },
    ),
  );
}


export async function getPartnerRequestDocument(requestId, side) {
  const response = await apiClient.get(
    `/admin/partner-requests/${requestId}/cccd/${side}`,
    { responseType: "blob" },
  );
  return response.data;
}

export async function getPendingHotels() {
  return unwrap(await apiClient.get("/admin/hotels/pending"));
}

export async function approveHotel(hotelId) {
  return unwrap(
    await apiClient.patch(`/admin/hotels/${hotelId}/approve`),
  );
}

export async function rejectHotel(hotelId, reason) {
  return unwrap(
    await apiClient.patch(`/admin/hotels/${hotelId}/reject`, {
      reason,
    }),
  );
}

export async function getAdminUsers(params = {}) {
  return unwrap(await apiClient.get("/admin/users", { params }));
}

export async function getAdminUser(userId) {
  return unwrap(await apiClient.get(`/admin/users/${userId}`));
}

export async function lockAdminUser(userId) {
  return unwrap(await apiClient.patch(`/admin/users/${userId}/lock`));
}

export async function unlockAdminUser(userId) {
  return unwrap(await apiClient.patch(`/admin/users/${userId}/unlock`));
}

export async function deleteAdminUser(userId) {
  return unwrap(await apiClient.delete(`/admin/users/${userId}`));
}

export async function getPendingRoomTypes() {
  return unwrap(await apiClient.get("/admin/room-types/pending"));
}

export async function approveRoomType(roomTypeId) {
  return unwrap(await apiClient.patch(`/admin/room-types/${roomTypeId}/approve`));
}

export async function rejectRoomType(roomTypeId, reason) {
  return unwrap(await apiClient.patch(`/admin/room-types/${roomTypeId}/reject`, { reason }));
}
