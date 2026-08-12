import apiClient from "../api/apiClient";

export async function getMyNotifications(userId, role, unreadOnly = false) {
  if (!userId) return [];
  const response = await apiClient.get(`/users/${userId}/notifications`, {
    params: {
      role: role || undefined,
      unreadOnly,
    },
  });
  return response.data;
}

export async function markNotificationRead(notificationId, userId) {
  const response = await apiClient.patch(`/notifications/${notificationId}/read`, null, {
    params: { userId },
  });
  return response.data;
}

export async function markAllNotificationsRead(userId, role) {
  const response = await apiClient.patch(`/users/${userId}/notifications/read-all`, null, {
    params: { role: role || undefined },
  });
  return response.data;
}
