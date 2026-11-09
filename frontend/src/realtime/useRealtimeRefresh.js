import { useEffect, useMemo, useRef } from "react";

import { useRealtime } from "./RealtimeContext";

export default function useRealtimeRefresh(types, refresh, options = {}) {
  const { subscribe } = useRealtime();
  const refreshRef = useRef(refresh);
  const timerRef = useRef(null);
  const debounceMs = Number(options.debounceMs ?? 120);
  const pollMs=Number(options.pollMs ?? 0);
  const revalidateOnFocus=Boolean(options.revalidateOnFocus);
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

  useEffect(()=>{
    if(!revalidateOnFocus && !pollMs) return undefined;
    let refreshing=false;
    async function resume() {
      if(document.visibilityState==="hidden" || refreshing) return;
      refreshing=true;
      try{await refreshRef.current?.({type:"PAGE_REVALIDATE"});}catch{/* Preserve the current view on a transient connection error. */}
      finally{refreshing=false;}
    }
    if(revalidateOnFocus){window.addEventListener("focus",resume);document.addEventListener("visibilitychange",resume);}
    const timer=pollMs>0?window.setInterval(resume,Math.max(1000,pollMs)):null;
    return ()=>{if(timer)window.clearInterval(timer);window.removeEventListener("focus",resume);document.removeEventListener("visibilitychange",resume);};
  },[pollMs,revalidateOnFocus]);
}
