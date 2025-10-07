import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["spec/**/*.spec.ts"],
    testTimeout: 30000, // 30 seconds for integration tests that build projects
    hookTimeout: 30000, // 30 seconds for beforeAll hooks that start servers
  },
});
