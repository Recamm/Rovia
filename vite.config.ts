import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pwa from "./scripts/pwa-plugin.mjs";
export default defineConfig({
  plugins: [react(), pwa()],
  test: {
    environment: "jsdom",
    testTimeout: 20000,
    maxWorkers: 2,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  build: { chunkSizeWarningLimit: 800 },
});
