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

/** Classes a page that embeds the report writes itself (README, "Publishing a report"). */
const PUBLIC_CLASSES: readonly string[] = ["lockrot-provenance"];

function stylesheets(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

/** Every class each selector of `css` names; declarations and comments name none. */
function selectorClasses(css: string): string[] {
  const preludes = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{};]+(?=\{)/g) ?? [];
  return preludes
    .filter((prelude) => !prelude.trim().startsWith("@"))
    .flatMap((prelude) => [...prelude.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1] ?? ""));
}

describe("dead selectors", () => {
  it("every class a stylesheet names is written by src/ code, or is public", () => {
    const code = sourceFiles(SRC).map((file) => readFileSync(file, "utf8"));
    const words = new Set(code.flatMap((text) => text.match(/[\w-]+/g) ?? []));
    // A class built in a template literal (`tone-${tone}`) shows only its prefix.
    const prefixes = code.flatMap((text) => [...text.matchAll(/([a-z][\w-]*-)\$\{/g)].map((m) => m[1] ?? ""));
    const used = (name: string) =>
      words.has(name) || PUBLIC_CLASSES.includes(name) || prefixes.some((prefix) => name.startsWith(prefix));

    const unused = stylesheets(SRC).flatMap((file) =>
      selectorClasses(readFileSync(file, "utf8"))
        .filter((name) => !used(name))
        .map((name) => `${file.slice(SRC.length + 1)}: .${name}`),
    );

    expect([...new Set(unused)]).toEqual([]);
  });
});

describe("font sizes and radii come from tokens.css", () => {
  const sheets = stylesheets(SRC).filter((file) => !file.endsWith("tokens.css"));
  const declarations = sheets.flatMap((file) =>
    [
      ...readFileSync(file, "utf8").matchAll(/(font-size|font|border(?:-[a-z]+)*-radius)\s*:\s*([^;}]+)/g),
    ].map((match) => ({
      file: file.slice(SRC.length + 1),
      property: match[1] ?? "",
      value: (match[2] ?? "").trim(),
    })),
  );

  it("finds the declarations it checks", () => {
    expect(declarations.filter(({ property }) => property === "font-size").length).toBeGreaterThan(100);
    expect(declarations.filter(({ property }) => property.endsWith("radius")).length).toBeGreaterThan(30);
  });

  it("declares no literal font size", () => {
    const literal = declarations.filter(({ property, value }) => {
      if (property === "font-size") return /^\d/.test(value) && !/em$/.test(value);
      // The size of a `font` shorthand is the number before an optional `/line-height`.
      return property === "font" && /(^|\s)\d+(\.\d+)?(px|pt)(\/|\s|$)/.test(value);
    });
    expect(literal).toEqual([]);
  });

  it("declares no literal radius but 0", () => {
    const literal = declarations.filter(
      ({ property, value }) =>
        property.endsWith("radius") && value.split(/\s+/).some((part) => /^[1-9]/.test(part)),
    );
    expect(literal).toEqual([]);
  });
});
