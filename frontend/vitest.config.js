import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest reads this file instead of vite.config.js when you run `npm test`.
// `npm run dev` and `npm run build` keep using vite.config.js and are not affected.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom", // a pretend browser, so components can be drawn without opening Chrome
    setupFiles: ["./src/test/setup.js"],
    css: false, // the tests check behaviour and text, not styling
  },
});
