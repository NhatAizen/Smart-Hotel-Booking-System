import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "../auth/AuthContext";

const RealtimeContext = createContext(null);

function buildRealtimeUrl(accessToken) {
  const explicit = import.meta.env.VITE_REALTIME_WS_URL;
  if (explicit) {
    const url = new URL(explicit, window.location.origin);
    if (accessToken) url.searchParams.set("token", accessToken);
    return url.toString();
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api";
  const apiUrl = new URL(apiBase, window.location.origin);
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  apiUrl.pathname = "/ws/realtime";
  apiUrl.search = "";
  if (accessToken) apiUrl.searchParams.set("token", accessToken);
  return apiUrl.toString();
}

export function RealtimeProvider({ children }) {
  const { accessToken, refreshUserProfile } = useAuth();
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const initialConnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const listenersRef = useRef(new Map());
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("connecting");

  const emit = useCallback((event) => {
    const type = String(event?.type ?? "").trim().toUpperCase();
    if (!type) return;

    const notify = (key) => {
      const listeners = listenersRef.current.get(key);
      if (!listeners) return;
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch {
          // Một subscriber lỗi không được làm ngắt realtime toàn ứng dụng.
        }
      }
    };

    notify(type);
    notify("*");

    window.dispatchEvent(
      new CustomEvent("enziurooms:realtime", { detail: event }),
    );

    // Khi đối tác được duyệt/hạ role, đồng bộ profile ngay để quyền trên UI không bị cũ.
    if (
      type === "NOTIFICATION_CREATED" &&
      String(event?.data?.category ?? "").toUpperCase() === "PARTNER" &&
      accessToken
    ) {
      refreshUserProfile().catch(() => {
        // AuthContext tự xử lý trường hợp role/token thay đổi.
      });
    }
  }, [accessToken, refreshUserProfile]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatRef.current) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (initialConnectTimerRef.current) {
      window.clearTimeout(initialConnectTimerRef.current);
      initialConnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let stopped = false;

    function scheduleReconnect() {
      if (stopped || !mountedRef.current) return;
      const delay = Math.min(15000, 1000 * 2 ** reconnectAttemptRef.current);
      reconnectAttemptRef.current = Math.min(reconnectAttemptRef.current + 1, 4);
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    }

    function connect() {
      if (stopped || !mountedRef.current) return;
      clearTimers();

      if (socketRef.current) {
        try {
          socketRef.current.close(1000, "reconnect");
        } catch {
          // ignore
        }
      }

      setStatus("connecting");
      const socket = new WebSocket(buildRealtimeUrl(accessToken));
      socketRef.current = socket;

      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        reconnectAttemptRef.current = 0;
        setStatus("connected");
        heartbeatRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send("ping");
        }, 25000);
      };

      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data);
          if (event?.type !== "PONG") emit(event);
        } catch {
          // Bỏ qua frame không phải JSON.
        }
      };

      socket.onerror = () => {
        if (socketRef.current === socket) setStatus("disconnected");
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        clearTimers();
        setStatus("disconnected");
        scheduleReconnect();
      };
    }

    // Defer lần kết nối đầu 1 tick. Trong React StrictMode (dev), effect được
    // mount/unmount thử một lần; nếu mở WebSocket ngay lập tức Chrome sẽ báo
    // "closed before the connection is established" dù lần mount sau vẫn chạy.
    // Trì hoãn giúp cleanup của lượt thử hủy timer trước khi socket được tạo.
    initialConnectTimerRef.current = window.setTimeout(() => {
      initialConnectTimerRef.current = null;
      connect();
    }, 0);

    function reconnectWhenVisible() {
      if (
        document.visibilityState === "visible" &&
        (!socketRef.current || socketRef.current.readyState > WebSocket.OPEN)
      ) {
        reconnectAttemptRef.current = 0;
        connect();
      }
    }

    window.addEventListener("online", reconnectWhenVisible);
    window.addEventListener("focus", reconnectWhenVisible);
    document.addEventListener("visibilitychange", reconnectWhenVisible);

    return () => {
      stopped = true;
      mountedRef.current = false;
      clearTimers();
      window.removeEventListener("online", reconnectWhenVisible);
      window.removeEventListener("focus", reconnectWhenVisible);
      document.removeEventListener("visibilitychange", reconnectWhenVisible);
      if (socketRef.current) {
        const socket = socketRef.current;
        socketRef.current = null;
        try {
          socket.close(1000, "provider-unmount");
        } catch {
          // ignore
        }
      }
    };
  }, [accessToken, clearTimers, emit]);

  const subscribe = useCallback((type, listener) => {
    const key = String(type ?? "*").trim().toUpperCase() || "*";
    const listeners = listenersRef.current.get(key) ?? new Set();
    listeners.add(listener);
    listenersRef.current.set(key, listeners);

    return () => {
      const current = listenersRef.current.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) listenersRef.current.delete(key);
    };
  }, []);

  const value = useMemo(() => ({ status, subscribe }), [status, subscribe]);

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime phải được dùng bên trong RealtimeProvider");
  }
  return context;
}
