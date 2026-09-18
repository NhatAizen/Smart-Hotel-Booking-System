import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  build: {
    // Giữ build tương thích cả Windows và Linux khi package native CSS không có sẵn.
    cssMinify: false,
  },

  server: {
    host: "127.0.0.1",
    port: 5300,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
