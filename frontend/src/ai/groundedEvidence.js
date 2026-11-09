// Bind facts to the requested hotel, stay and room type; payload shape is insufficient.
export function availabilityMatches(data, hotelId, trip) {
  return String(data?.hotelId ?? '') === String(hotelId)
    && data?.checkIn === trip?.checkIn && data?.checkOut === trip?.checkOut
    && Array.isArray(data?.unavailableRoomIds)
    && data.unavailableRoomIds.every(id => typeof id === 'string' && id.length > 0);
}

export function roomQuoteEvidence(quote, roomTypeId, hotelId, trip, roomId) {
  if (!hotelId || String(quote?.hotelId ?? '') !== String(hotelId)
    || quote?.checkIn !== trip?.checkIn || quote?.checkOut !== trip?.checkOut) return null;
  if (!roomId || !roomTypeId || !Array.isArray(quote?.rooms)) return null;
  const room = quote.rooms.find(item => String(item?.roomTypeId) === String(roomTypeId) && String(item?.roomId) === String(roomId));
  if (!room) return null;
  const raw = room.totalAmount ?? (quote.rooms.length === 1 ? quote.totalAmount : null);
  if (raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) return null;
  return { room, totalAmount: Number(raw) };
}

export function declaredAmenities(hotel) {
  return [
    ...(Array.isArray(hotel?.amenities) ? hotel.amenities : []),
    ...(Array.isArray(hotel?.roomAmenities) ? hotel.roomAmenities : []),
    ...(hotel?.breakfastIncluded === true ? ['Bữa sáng'] : []),
  ].filter(value => typeof value === 'string' && value.trim());
}
