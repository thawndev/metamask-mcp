import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { MM_PROFILES_DIR: ".agents/run/test/profiles" },
    testTimeout: 20000,
  },
});
