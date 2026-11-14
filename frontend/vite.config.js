import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The backend only accepts calls from http://localhost:5173 and http://127.0.0.1:5173 (CORS),
// so the dev server must keep this exact port. strictPort stops Vite from quietly picking another.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
