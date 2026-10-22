import { defineConfig } from "vitest/config";

export default defineConfig({
  build: { outDir: "dist", target: "es2022" },
  test: {
    // Playwright specs (parity, visual) live under tests/ too; Vitest only runs unit tests.
    include: ["tests/unit/**/*.test.ts"],
  },
});
