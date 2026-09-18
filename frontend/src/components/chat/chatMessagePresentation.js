export const CHAT_MESSAGE_GROUP = Object.freeze({
  CUSTOMER: "CUSTOMER_MESSAGE",
  HOTEL_SIDE: "HOTEL_SIDE_MESSAGE",
  SYSTEM: "SYSTEM_EVENT",
});

export const CHAT_MESSAGE_POSITION = Object.freeze({
  INCOMING: "incoming",
  OUTGOING: "outgoing",
  SYSTEM: "system",
});

const SYSTEM_SENDERS = new Set(["SYSTEM", "SYSTEM_EVENT", "PLATFORM"]);

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function getChatMessageGroup(message) {
  const senderType = normalize(message?.senderType);

  if (SYSTEM_SENDERS.has(senderType)) return CHAT_MESSAGE_GROUP.SYSTEM;
  if (senderType === "CUSTOMER") return CHAT_MESSAGE_GROUP.CUSTOMER;

  // HOTEL_ADMIN, HOTEL_STAFF, HOTEL_BOT, ASSISTANT and AUTO_REPLY are all
  // presented as one hotel-side participant. Unknown non-system senders fall
  // back to this side so new hotel assistant variants do not appear as guests.
  return CHAT_MESSAGE_GROUP.HOTEL_SIDE;
}

export function getChatMessagePosition(message, viewerRole) {
  const group = getChatMessageGroup(message);
  if (group === CHAT_MESSAGE_GROUP.SYSTEM) return CHAT_MESSAGE_POSITION.SYSTEM;

  const viewer = normalize(viewerRole).replace(/^ROLE_/, "");
  const viewerOwnsMessage = viewer === "CUSTOMER"
    ? group === CHAT_MESSAGE_GROUP.CUSTOMER
    : group === CHAT_MESSAGE_GROUP.HOTEL_SIDE;

  return viewerOwnsMessage
    ? CHAT_MESSAGE_POSITION.OUTGOING
    : CHAT_MESSAGE_POSITION.INCOMING;
}

export function isSameChatMessageRun(first, second, viewerRole) {
  if (!first || !second) return false;
  const firstPosition = getChatMessagePosition(first, viewerRole);
  const secondPosition = getChatMessagePosition(second, viewerRole);
  return firstPosition !== CHAT_MESSAGE_POSITION.SYSTEM && firstPosition === secondPosition;
}
