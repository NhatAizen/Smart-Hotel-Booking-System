import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AuthProvider } from "./auth/AuthContext";
import AppRoutes from "./routes/AppRoutes";

import "./index.css";
import "./styles/global.css";

createRoot(
  document.getElementById("root"),
).render(
  <StrictMode>
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  </StrictMode>,
);