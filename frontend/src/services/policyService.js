import apiClient from "../api/apiClient";

function unwrap(response) {
  return response.data;
}

export async function getHotelPolicy(hotelId) {
  return unwrap(await apiClient.get(`/hotels/${hotelId}/policies`));
}

export async function getMyHotelPolicy(hotelId) {
  return unwrap(await apiClient.get(`/hotels/mine/${hotelId}/policies`));
}

export async function updateMyHotelPolicy(hotelId, payload) {
  return unwrap(await apiClient.put(`/hotels/${hotelId}/policies`, payload));
}

export async function getPlatformPolicy() {
  return unwrap(await apiClient.get("/platform-policies"));
}

export async function updatePlatformPolicy(payload) {
  return unwrap(await apiClient.put("/admin/platform-policies", payload));
}
