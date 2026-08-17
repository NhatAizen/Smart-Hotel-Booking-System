import apiClient from "../api/apiClient";

const data = (response) => response.data;

export async function getMembershipProfile() {
  return data(await apiClient.get("/membership/me"));
}

export async function getMembershipLevels() {
  return data(await apiClient.get("/membership/tiers"));
}

export async function getMembershipTiers() {
  return data(await apiClient.get("/admin/membership-tiers"));
}

export async function updateMembershipTier(level, payload) {
  return data(await apiClient.put(`/admin/membership-tiers/${level}`, payload));
}

export async function previewDiscount(payload) {
  return data(await apiClient.post("/discounts/preview", payload));
}

export async function getAvailablePromotions(hotelId) {
  return data(await apiClient.get("/promotions/available", { params: { hotelId } }));
}

export async function getPromotionRecommendations(hotelId, amount) {
  return data(await apiClient.get("/promotions/recommendations", {
    params: { hotelId, amount },
  }));
}

export async function getSavedPromotions() {
  return data(await apiClient.get("/promotions/saved/me"));
}

export async function savePromotion(promotionId) {
  return data(await apiClient.post(`/promotions/${promotionId}/save`));
}

export async function removeSavedPromotion(promotionId) {
  await apiClient.delete(`/promotions/${promotionId}/save`);
}

export async function getHotelPromotions() {
  return data(await apiClient.get("/hotel-admin/promotions"));
}

export async function createHotelPromotion(payload) {
  return data(await apiClient.post("/hotel-admin/promotions", payload));
}

export async function setHotelPromotionActive(id, active) {
  return data(await apiClient.patch(`/hotel-admin/promotions/${id}/active`, null, { params: { active } }));
}

export async function getPlatformPromotions() {
  return data(await apiClient.get("/admin/promotions"));
}

export async function createPlatformPromotion(payload) {
  return data(await apiClient.post("/admin/promotions", payload));
}

export async function setPlatformPromotionActive(id, active) {
  return data(await apiClient.patch(`/admin/promotions/${id}/active`, null, { params: { active } }));
}

export async function getActiveCampaigns() {
  return data(await apiClient.get("/campaigns/active"));
}

export async function getAdminCampaigns() {
  return data(await apiClient.get("/admin/campaigns"));
}

export async function createCampaign(payload) {
  return data(await apiClient.post("/admin/campaigns", payload));
}

export async function setCampaignActive(id, active) {
  return data(await apiClient.patch(`/admin/campaigns/${id}/active`, null, { params: { active } }));
}
