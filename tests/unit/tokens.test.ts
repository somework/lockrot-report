// The ratio claims of the tokens.css header, computed by WCAG 2.2's relative luminance formula.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const CSS = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");

type Tokens = Readonly<Record<string, string>>;

function block(selector: string): Tokens {
  const at = CSS.indexOf(`${selector} {`);
  if (at === -1) throw new Error(`tokens.css has no ${selector} block`);
  const body = CSS.slice(at, CSS.indexOf("}", at));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m): [string, string] => [
      m[1] ?? "",
      m[2] ?? "",
    ]),
  );
}

const LIGHT = block(":root");
const DARK_OS = block(':root:not([data-theme="light"])');
const DARK_PINNED = block(':root[data-theme="dark"]');
const THEMES = [
  ["light", LIGHT],
  ["dark", DARK_OS],
] as const;

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(tokens: Tokens, fore: string, back: string): number {
  const [a, b] = [fore, back].map((name) => {
    const hex = tokens[name];
    if (hex === undefined) throw new Error(`no --${name}`);
    return luminance(hex);
  });
  return (Math.max(a ?? 0, b ?? 0) + 0.05) / (Math.min(a ?? 0, b ?? 0) + 0.05);
}

/** Each pair below its floor, as "fore on back = ratio", so a failure names the token. */
function below(tokens: Tokens, pairs: readonly (readonly [string, string])[], floor: number): string[] {
  return pairs
    .filter(([fore, back]) => ratio(tokens, fore, back) < floor)
    .map(([fore, back]) => `--${fore} on --${back} = ${ratio(tokens, fore, back).toFixed(2)}`);
}

const TONES = ["crit", "high", "med", "low", "none", "unk"] as const;
const SURFACES = ["bg", "surface", "surface-2"] as const;

describe("the tokens.css header's claims (R6-52)", () => {
  test("the dark block is written twice, the same both times", () => {
    expect(DARK_PINNED).toEqual(DARK_OS);
  });

  test.each(THEMES)(
    "every tone keeps 4.5:1 as text on --bg, --surface, --surface-2 and its own -soft fill (%s)",
    (_, tokens) => {
      const pairs = TONES.flatMap((tone) =>
        [...SURFACES, `${tone}-soft`].map((back) => [tone, back] as const),
      );
      expect(below(tokens, pairs, 4.5)).toEqual([]);
    },
  );

  test.each(THEMES)("every mark keeps 3:1 against every surface it sits on (%s)", (_, tokens) => {
    const pairs = TONES.flatMap((tone) => SURFACES.map((back) => [`${tone}-mark`, back] as const));
    expect(below(tokens, pairs, 3)).toEqual([]);
  });

  test.each(THEMES)("the marks stand out from the page in grade order, critical most (%s)", (_, tokens) => {
    const salience = (tone: string): number => ratio(tokens, `${tone}-mark`, "bg");
    const graded = ["crit", "high", "med", "low"].map(salience);
    expect(graded).toEqual([...graded].sort((a, b) => b - a));
    expect(Math.min(...graded)).toBeGreaterThan(Math.max(salience("unk"), salience("none")));
  });

  test.each(THEMES)("a field boundary keeps 3:1 on --bg, --surface and --surface-2 (%s)", (_, tokens) => {
    const pairs = SURFACES.map((back) => ["control-border", back] as const);
    expect(below(tokens, pairs, 3)).toEqual([]);
  });
});
