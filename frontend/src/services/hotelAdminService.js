import apiClient from "../api/apiClient";

function data(response) {
  return response.data;
}

function appendFiles(files) {
  const formData = new FormData();

  Array.from(files ?? []).forEach((file) => {
    formData.append("files", file);
  });

  return formData;
}

/* =========================================================
   HOTEL
========================================================= */

export async function getMyHotels() {
  return data(await apiClient.get("/hotels/mine"));
}

export async function getMyHotel(hotelId) {
  return data(await apiClient.get(`/hotels/mine/${hotelId}`));
}

export async function createHotel(payload) {
  return data(await apiClient.post("/hotels", payload));
}

export async function updateHotel(hotelId, payload) {
  return data(await apiClient.put(`/hotels/${hotelId}`, payload));
}

export async function deleteHotel(hotelId) {
  await apiClient.delete(`/hotels/${hotelId}`);
}

export async function submitHotel(hotelId) {
  return data(await apiClient.patch(`/hotels/${hotelId}/submit`));
}

/* =========================================================
   HOTEL IMAGES
========================================================= */

export async function uploadHotelImages(hotelId, files) {
  return data(
    await apiClient.post(
      `/hotels/${hotelId}/images`,
      appendFiles(files),
    ),
  );
}

export async function setHotelCover(hotelId, imageId) {
  return data(
    await apiClient.patch(
      `/hotels/${hotelId}/images/${imageId}/cover`,
    ),
  );
}

export async function deleteHotelImage(hotelId, imageId) {
  await apiClient.delete(`/hotels/${hotelId}/images/${imageId}`);
}

/* =========================================================
   ROOM TYPES
========================================================= */

export async function getRoomTypes(hotelId) {
  return data(
    await apiClient.get(`/hotels/${hotelId}/room-types/manage`),
  );
}

export async function getRoomType(roomTypeId) {
  return data(
    await apiClient.get(`/room-types/${roomTypeId}/manage`),
  );
}

export async function createRoomType(hotelId, payload) {
  return data(
    await apiClient.post(`/hotels/${hotelId}/room-types`, payload),
  );
}

export async function updateRoomType(roomTypeId, payload) {
  return data(
    await apiClient.put(`/room-types/${roomTypeId}`, payload),
  );
}

export async function submitRoomType(roomTypeId) {
  return data(
    await apiClient.patch(`/room-types/${roomTypeId}/submit`),
  );
}

export async function deactivateRoomType(roomTypeId) {
  await apiClient.delete(`/room-types/${roomTypeId}`);
}

/* =========================================================
   ROOM TYPE IMAGES
========================================================= */

export async function uploadRoomTypeImages(roomTypeId, files) {
  return data(
    await apiClient.post(
      `/room-types/${roomTypeId}/images`,
      appendFiles(files),
    ),
  );
}

export async function setRoomTypeCover(roomTypeId, imageId) {
  return data(
    await apiClient.patch(
      `/room-types/${roomTypeId}/images/${imageId}/cover`,
    ),
  );
}

export async function deleteRoomTypeImage(roomTypeId, imageId) {
  await apiClient.delete(
    `/room-types/${roomTypeId}/images/${imageId}`,
  );
}

/* =========================================================
   ROOMS
========================================================= */

/**
 * Lấy danh sách phòng thực tế của khách sạn.
 *
 * Được RoomTypesPage sử dụng khi Hotel Admin chỉnh số lượng
 * phòng của một loại phòng.
 */
export async function getManagedRooms(hotelId, params = {}) {
  return data(
    await apiClient.get(
      `/hotels/${hotelId}/rooms/manage`,
      { params },
    ),
  );
}

/**
 * Tạo một phòng thực tế.
 */
export async function createRoom(hotelId, payload) {
  return data(
    await apiClient.post(
      `/hotels/${hotelId}/rooms`,
      payload,
    ),
  );
}

/**
 * Tạo nhiều phòng cùng lúc.
 *
 * Ví dụ:
 *
 * rooms = [
 *   {
 *     roomTypeId: "...",
 *     roomNumber: "201",
 *     floor: 2,
 *     customPrice: null,
 *     note: ""
 *   }
 * ]
 */
export async function createRoomsBatch(hotelId, rooms) {
  return data(
    await apiClient.post(
      `/hotels/${hotelId}/rooms/batch`,
      { rooms },
    ),
  );
}

/**
 * Cập nhật một phòng.
 */
export async function updateRoom(roomId, payload) {
  return data(
    await apiClient.put(
      `/rooms/${roomId}`,
      payload,
    ),
  );
}

/**
 * Hoàn tất việc dọn phòng.
 */
export async function completeRoomCleaning(roomId) {
  return data(
    await apiClient.patch(
      `/rooms/${roomId}/cleaning/complete`,
    ),
  );
}

/**
 * Ngừng hoạt động một phòng.
 *
 * RoomTypesPage sử dụng API này khi Hotel Admin giảm
 * số lượng phòng của một loại phòng.
 */
export async function deactivateRoom(roomId) {
  await apiClient.delete(`/rooms/${roomId}`);
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

export async function getMyNotifications(userId) {
  if (!userId) {
    return [];
  }

  return data(
    await apiClient.get(
      `/users/${userId}/notifications`,
    ),
  );
}

export async function markNotificationRead(notificationId) {
  return data(
    await apiClient.patch(
      `/notifications/${notificationId}/read`,
    ),
  );
}