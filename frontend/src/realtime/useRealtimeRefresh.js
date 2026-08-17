import { useEffect, useMemo, useRef } from "react";

import { useRealtime } from "./RealtimeContext";

export default function useRealtimeRefresh(types, refresh, options = {}) {
  const { subscribe } = useRealtime();
  const refreshRef = useRef(refresh);
  const timerRef = useRef(null);
  const debounceMs = Number(options.debounceMs ?? 120);
  const filterRef = useRef(options.filter);
  const typeKey = useMemo(
    () => [...new Set((Array.isArray(types) ? types : [types])
      .filter(Boolean)
      .map((value) => String(value).trim().toUpperCase()))].join("|"),
    [types],
  );

  useEffect(() => {
    refreshRef.current = refresh;
    filterRef.current = options.filter;
  }, [refresh, options.filter]);

  useEffect(() => {
    const normalized = typeKey ? typeKey.split("|") : [];

    function handle(event) {
      if (filterRef.current && !filterRef.current(event)) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        Promise.resolve(refreshRef.current?.(event)).catch(() => {
          // Refresh nền không được làm hỏng trang hiện tại.
        });
      }, debounceMs);
    }

    const unsubscribe = normalized.map((type) => subscribe(type, handle));
    return () => {
      unsubscribe.forEach((fn) => fn());
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [debounceMs, subscribe, typeKey]);
}
