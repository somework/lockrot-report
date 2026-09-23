import { test } from "@playwright/test";

/**
 * history.md item 4: package names are untrusted document data, and `rowFor()` deliberately avoids
 * building a CSS selector out of one (a name containing `[`, `]`, `\` or a quote would otherwise
 * throw out of `querySelector` and "take the keyboard with it").
 *
 * None of `fixtures/bundles/*.json` contains a package name with a CSS-selector metacharacter —
 * checked programmatically (`/[[\]\\'"<>]/`) against every finding's `package` across all eight
 * fixtures. The task's own instructions are explicit that this case is skipped when no fixture has
 * one, rather than fabricated, so this file records that check and its result instead of silently
 * omitting the scenario.
 */
test.skip("rows for a package name containing CSS-selector metacharacters", () => {
  // Intentionally empty: no fixture exercises this path. If a future fixture adds a package name
  // matching /[[\]\\'"<>]/, un-skip this and assert that opening it, and pressing j/k onto it,
  // does not throw and does not break the page's own selector-building (report.js:83-95).
});
