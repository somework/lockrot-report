// Guards against dead CSS shipping in every generated report. Not a dist/ build check (no `npm run
// build` needed): it reads the source files directly, so it runs in the same fast unit suite as
// everything else and catches the drift the moment a rule and its last user part ways.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd());
const SRC = join(ROOT, "src");

/** Every `.ts`/`.tsx`/`.html` file under `src/`, recursively — where a class name could be used. */
function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|html)$/.test(entry.name) ? [full] : [];
  });
}

describe(".sr-only (quality finding: shipped in every report, used nowhere)", () => {
  it("is not declared in base.css unless something under src/ still uses the class", () => {
    const baseCss = readFileSync(join(SRC, "styles", "base.css"), "utf8");
    const declaresIt = /\.sr-only\b/.test(baseCss);

    const usedElsewhere = sourceFiles(SRC).some((file) => {
      if (file.endsWith(join("styles", "base.css"))) return false;
      return /\bsr-only\b/.test(readFileSync(file, "utf8"));
    });

    // Either the rule is gone, or something actually reaches for it — never both a declared rule
    // and zero users, which is exactly the state that shipped it dead in every built report.
    expect(declaresIt && !usedElsewhere).toBe(false);
  });
});
