import { useEffect } from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { useAiAssistant } from "../../ai/AiAssistantContext";

export default function AiAssistantLegacyRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openAssistant } = useAiAssistant();

  useEffect(() => {
    openAssistant({
      hotelId: searchParams.get("hotelId") || undefined,
      checkIn: searchParams.get("checkIn") || undefined,
      checkOut: searchParams.get("checkOut") || undefined,
      adults:
        searchParams.get("adults")
        || searchParams.get("guests")
        || undefined,
      children: searchParams.get("children") || undefined,
      openTrip: Boolean(
        searchParams.get("checkIn")
        || searchParams.get("checkOut"),
      ),
    });

    navigate("/hotels", { replace: true });
  }, [navigate, openAssistant, searchParams]);

  return null;
}
