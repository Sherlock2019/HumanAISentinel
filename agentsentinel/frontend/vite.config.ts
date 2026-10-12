import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const target = process.env.SENTINEL_API_TARGET || "http://127.0.0.1:8000";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": target, "/health": target } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { charts: ["recharts"], graph: ["@xyflow/react"] },
      },
    },
  },
});
