// Unit and component tests run under happy-dom (DESIGN.md §6): fast enough for the domain/state
// modules that touch no DOM at all, and enough of a browser to mount Preact components with
// @testing-library/preact for the ones that do. Playwright (e2e/) is a separate project with its
// own config; it is not run through vitest.
import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/build/**/*.test.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.ts", "src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary"],
      // Floors at the first measurement: raise one when a change lifts its glob, never lower it.
      thresholds: {
        "src/domain/**": { lines: 98, statements: 98, functions: 99, branches: 89 },
        "src/state/**": { lines: 100, statements: 100, functions: 100, branches: 98 },
        "src/model/**": { lines: 97, statements: 97, functions: 100, branches: 93 },
        "src/ui/**": { lines: 93, statements: 91, functions: 92, branches: 86 },
      },
    },
  },
});
