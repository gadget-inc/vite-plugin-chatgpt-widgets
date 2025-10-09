import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { chatGPTWidgetPlugin } from "../../../src/index.js";

export default defineConfig({
  css: {
    postcss: "./postcss.config.js",
  },
  plugins: [
    reactRouter(),
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
