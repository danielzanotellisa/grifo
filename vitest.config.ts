import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
        },
      },
      {
        // Client components of the web app, rendered in jsdom.
        oxc: { jsx: { runtime: "automatic" } },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["apps/web/**/*.test.tsx"],
          exclude: ["**/node_modules/**"],
          setupFiles: ["./apps/web/src/test/ui-setup.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: [
            "packages/**/*.integration.test.ts",
            "apps/**/*.integration.test.ts",
            "scripts/**/*.integration.test.ts",
          ],
          exclude: ["**/node_modules/**"],
          // Tests that use the database and the storage are slower on CI than the 5 s default allows.
          testTimeout: 30_000,
          globalSetup: ["./scripts/db/global-setup.ts"],
        },
      },
    ],
  },
});
