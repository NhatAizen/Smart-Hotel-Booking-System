import apiClient from "../api/apiClient";

function multipartJson(field, payload, files = []) {
  const formData = new FormData();
  formData.append(field, new Blob([JSON.stringify(payload)], { type: "application/json" }));
  files.forEach((file) => formData.append("evidence", file));
  return formData;
}

export async function createComplaint(payload, files = []) {
  const response = await apiClient.post("/complaints", multipartJson("complaint", payload, files));
  return response.data;
}
export async function getMyComplaints() {
  const response = await apiClient.get("/complaints");
  return response.data;
}
export async function getMyComplaint(id) {
  const response = await apiClient.get(`/complaints/${id}`);
  return response.data;
}
export async function addComplaintEvidence(id, files, note = "") {
  const formData = new FormData();
  if (note) formData.append("note", note);
  files.forEach((file) => formData.append("evidence", file));
  const response = await apiClient.post(`/complaints/${id}/evidence`, formData);
  return response.data;
}
export async function cancelComplaint(id) {
  const response = await apiClient.post(`/complaints/${id}/cancel`);
  return response.data;
}
export async function getHotelComplaints() {
  const response = await apiClient.get("/hotel-admin/complaints");
  return response.data;
}
export async function respondToComplaint(id, message, files = []) {
  const response = await apiClient.post(
    `/hotel-admin/complaints/${id}/responses`,
    multipartJson("response", { message }, files),
  );
  return response.data;
}
export async function getAdminComplaints(status = "") {
  const response = await apiClient.get("/admin/complaints", {
    params: status ? { status } : undefined,
  });
  return response.data;
}
export async function actOnHotelComplaint(id, payload, files = []) {
  const response = await apiClient.post(`/hotel-admin/complaints/${id}/actions`, multipartJson("action", payload, files));
  return response.data;
}
export async function updateAdminComplaint(id, payload) {
  const response = await apiClient.patch(`/admin/complaints/${id}`, payload);
  return response.data;
}
export async function getComplaintEvidence(contentUrl) {
  const response = await apiClient.get(contentUrl.replace(/^\/api/, ""), { responseType: "blob" });
  return response.data;
}
