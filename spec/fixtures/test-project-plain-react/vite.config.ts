import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { chatGPTWidgetPlugin } from "../../../src/index.js";

export default defineConfig({
  plugins: [
    react(),
    chatGPTWidgetPlugin({
      widgetsDir: "web/chatgpt-widgets",
      baseUrl: "https://example.com",
    }),
  ],
  build: {
    manifest: true,
    outDir: "dist",
  },
});
