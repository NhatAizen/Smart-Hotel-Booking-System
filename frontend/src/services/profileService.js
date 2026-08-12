import apiClient from "../api/apiClient";

function data(response) {
  return response.data;
}

export async function getMyProfile() {
  return data(await apiClient.get("/users/me"));
}

export async function updateMyProfile(payload) {
  return data(await apiClient.put("/users/me", payload));
}

export async function uploadMyAvatar(file) {
  const formData = new FormData();
  formData.append("avatar", file);

  return data(await apiClient.patch("/users/me/avatar", formData));
}

export async function removeMyAvatar() {
  return data(await apiClient.delete("/users/me/avatar"));
}

export async function getMyPartnerRequest() {
  return data(await apiClient.get("/partner-requests/me"));
}

export async function verifyPartnerOcr(payload, cccdFront, cccdBack) {
  const formData = new FormData();
  formData.append(
    "data",
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
  );
  formData.append("cccdFront", cccdFront);
  formData.append("cccdBack", cccdBack);

  return data(
    await apiClient.post("/partner-requests/ocr/verify", formData, {
      timeout: 90000,
    }),
  );
}

export async function createPartnerEkycChallenge() {
  return data(
    await apiClient.post("/partner-requests/ekyc/challenge", null, {
      timeout: 15000,
    }),
  );
}


export async function verifyPartnerEkyc(cccdFront, ekycCapture) {
  const formData = new FormData();
  formData.append("cccdFront", cccdFront);
  formData.append("challengeToken", ekycCapture.challengeToken);
  ekycCapture.frames.forEach((frame, index) => {
    formData.append(`livenessFrame${index}`, frame);
  });

  return data(
    await apiClient.post("/partner-requests/ekyc/verify", formData, {
      timeout: 90000,
    }),
  );
}

export async function submitPartnerRequest(
  payload,
  cccdFront,
  cccdBack,
  ekycCapture,
) {
  const formData = new FormData();
  formData.append(
    "data",
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
  );
  formData.append("cccdFront", cccdFront);
  formData.append("cccdBack", cccdBack);
  formData.append("ekycReceipt", ekycCapture.verificationReceipt);

  return data(
    await apiClient.post("/partner-requests", formData, { timeout: 90000 }),
  );
}

export async function getMyPartnerDocument(side) {
  return data(
    await apiClient.get(`/partner-requests/me/cccd/${side}`, {
      responseType: "blob",
    }),
  );
}
