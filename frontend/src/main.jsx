import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import AppErrorBoundary from "./components/common/AppErrorBoundary";
import { AuthProvider } from "./auth/AuthContext";
import AppRoutes from "./routes/AppRoutes";
import { RealtimeProvider } from "./realtime/RealtimeContext";

import "./index.css";
import "./styles/index.css";

createRoot(
  document.getElementById("root"),
).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <RealtimeProvider>
          <AppRoutes />
        </RealtimeProvider>
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
