import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { chatGPTWidgetPlugin } from "../../../src/index.js";

export default defineConfig({
  css: {
    postcss: "./postcss.config.js",
  },
  plugins: [
    react(),
    chatGPTWidgetPlugin({
      widgetsDir: "web/chatgpt",
      baseUrl: "https://example.com",
    }),
  ],
  build: {
    manifest: true,
    outDir: "dist",
  },
});
