import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { WIDE_QUERY } from "../../src/ui/useWide";

const DESIGN = readFileSync(join(process.cwd(), "DESIGN.md"), "utf8");

test("DESIGN.md's breakpoint table opens the detail column at WIDE_QUERY's width", () => {
  const wide = Number(/min-width: (\d+)px/.exec(WIDE_QUERY)?.[1]);
  const rows = DESIGN.split("\n").filter((line) => line.startsWith("| ≥ ") || line.startsWith("| 760 – "));

  expect(rows.find((row) => row.includes("detail column"))).toContain(`≥ ${String(wide)}px`);
  expect(rows.find((row) => row.includes("full-screen sheet"))).toContain(`760 – ${String(wide - 1)}px`);
});
