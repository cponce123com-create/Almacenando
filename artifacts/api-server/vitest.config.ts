import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      SESSION_SECRET: "vitest-test-secret-key-minimum-48-characters-long-enough",
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 60,
        branches: 50,
        functions: 60,
        statements: 60,
      },
      include: ["src/routes/**", "src/lib/**"],
      exclude: [
        "src/__tests__/**",
        "**/*.test.ts",
        "src/lib/seed.ts",
        "src/lib/id.ts",
        "src/lib/validate-mime.ts",
      ],
    },
  },
});
