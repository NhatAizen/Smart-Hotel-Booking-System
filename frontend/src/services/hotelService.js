import apiClient from "../api/apiClient";

export async function getHotels() {
  const response = await apiClient.get("/hotels", {
    params: { _t: Date.now() },
  });
  return response.data;
}

export async function getHotelById(hotelId) {
  const response = await apiClient.get(`/hotels/${hotelId}`);
  return response.data;
}

export async function getRoomTypesByHotel(hotelId) {
  const response = await apiClient.get(
    `/hotels/${hotelId}/room-types`,
  );

  return response.data;
}

export async function getRoomsByHotel(hotelId, params = {}) {
  const response = await apiClient.get(
    `/hotels/${hotelId}/rooms`,
    { params },
  );

  return response.data;
}

export async function getRoomById(roomId) {
  const response = await apiClient.get(`/rooms/${roomId}`);
  return response.data;
}

export async function getRoomTypeById(roomTypeId) {
  const response = await apiClient.get(`/room-types/${roomTypeId}`);
  return response.data;
}
