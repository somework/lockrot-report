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
    // A test that reads lockrot's recorded cases parses the whole bundle, so under coverage on a
    // loaded runner the 5000 ms default fails it by time alone.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.ts", "src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary"],
      // Floors at the first measurement: raise one when a change lifts its glob, never lower it.
      thresholds: {
        "src/domain/**": { lines: 99, statements: 99, functions: 99, branches: 90 },
        "src/state/**": { lines: 100, statements: 100, functions: 100, branches: 98 },
        "src/model/**": { lines: 97, statements: 97, functions: 100, branches: 93 },
        "src/ui/**": { lines: 94, statements: 92, functions: 93, branches: 87 },
      },
    },
  },
});
