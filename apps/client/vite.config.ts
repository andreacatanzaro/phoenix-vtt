import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the browser talks to the Vite server, which forwards the API to the app server: one origin, so the
// session cookie works exactly as it will in production.
const target = process.env["VITE_API_TARGET"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173, proxy: { "/api": target, "/health": target } },
  build: { outDir: "dist", sourcemap: true },
});
