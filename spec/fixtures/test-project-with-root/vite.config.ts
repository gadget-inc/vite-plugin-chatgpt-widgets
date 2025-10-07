import { defineConfig } from "vite";
import { chatGPTWidgetPlugin } from "../../../src/index.js";

export default defineConfig({
  plugins: [
    chatGPTWidgetPlugin({
      widgetsDir: "web/chatgpt-widgets",
    }),
  ],
  build: {
    manifest: true,
    outDir: "dist",
  },
});
