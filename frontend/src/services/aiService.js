import apiClient from "../api/apiClient";

export async function askEnziuAssistant(payload) {
  const response = await apiClient.post("/ai/assistant", payload);
  return response.data;
}

// Legacy helper kept for compatibility with older screens/tests.
export async function askHotelAssistant(payload) {
  return askEnziuAssistant({
    message: payload?.message ?? payload?.requirement ?? "",
  });
}
