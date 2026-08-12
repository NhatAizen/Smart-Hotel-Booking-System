import apiClient from "../api/apiClient";

export async function getMyFavoriteHotels() {
  const response = await apiClient.get("/favorites");
  return response.data;
}

export async function getFavoriteState(hotelId) {
  const response = await apiClient.get(`/favorites/${hotelId}`);
  return response.data;
}

export async function addFavoriteHotel(hotelId) {
  const response = await apiClient.post(`/favorites/${hotelId}`);
  return response.data;
}

export async function removeFavoriteHotel(hotelId) {
  const response = await apiClient.delete(`/favorites/${hotelId}`);
  return response.data;
}
