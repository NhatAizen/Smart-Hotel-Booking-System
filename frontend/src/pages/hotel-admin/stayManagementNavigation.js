export const STAY_MANAGEMENT_PATH = "/hotel-admin/stays";

export function stayManagementUrl(tab = "check-in", search = "", hash = "") {
  const params = new URLSearchParams(search);
  params.set("tab", tab === "check-out" ? "check-out" : "check-in");
  return `${STAY_MANAGEMENT_PATH}?${params}${hash}`;
}
