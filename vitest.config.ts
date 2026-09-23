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
  },
});
