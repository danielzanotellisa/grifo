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
        test: {
          name: "integration",
          include: [
            "packages/**/*.integration.test.ts",
            "apps/**/*.integration.test.ts",
            "scripts/**/*.integration.test.ts",
          ],
          exclude: ["**/node_modules/**"],
          globalSetup: ["./scripts/db/global-setup.ts"],
        },
      },
    ],
  },
});
