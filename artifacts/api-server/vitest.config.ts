import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      SESSION_SECRET: "vitest-test-secret-key-minimum-48-characters-long-enough",
      NODE_ENV: "test",
    },
  },
});
