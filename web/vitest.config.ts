import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/__tests__/**",
        "src/test/**",
        "src/main.tsx",
      ],
      // Regression floor for the storefront. Set just under the current
      // critical-path actuals (stmts 46 / branch 40 / funcs 32 / lines 47) so
      // the suite fails if coverage slides back toward zero, and ratchets up as
      // more components are covered. Deliberately below admin's bar
      // (80/67/75/78) — this is a first floor, not the target.
      thresholds: {
        lines: 45,
        branches: 38,
        functions: 30,
        statements: 45,
      },
    },
  },
});
