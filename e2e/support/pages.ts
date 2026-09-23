/**
 * Where the two renderers' built pages live, and which fixture bundle each test file was written
 * against. `RENDERER=legacy|new` selects the directory; there is no baseURL (DESIGN.md §6: the
 * suite runs against `file://` pages), so every URL here is an absolute file path turned into a
 * `file://` URL.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
/** e2e/support -> e2e -> repo root. */
export const REPO_ROOT = join(HERE, "..", "..");

export type Renderer = "legacy" | "new";

const RENDERER_DIRS: Readonly<Record<Renderer, string>> = {
  legacy: join(REPO_ROOT, "build/legacy-pages"),
  new: join(REPO_ROOT, "build/pages"),
};

/**
 * `RENDERER` is read once per process. Anything else is a typo in the invocation, not a renderer
 * this suite knows how to run against, so it fails loudly instead of silently defaulting.
 */
export function currentRenderer(): Renderer {
  const value = process.env["RENDERER"] ?? "legacy";
  if (value !== "legacy" && value !== "new") {
    throw new Error(`RENDERER must be "legacy" or "new", got ${JSON.stringify(value)}`);
  }

  return value;
}

/** The `file://` URL for one fixture's built page, for the given renderer. */
export function pageUrl(renderer: Renderer, fixture: FixtureName): string {
  return "file://" + join(RENDERER_DIRS[renderer], fixture + ".html");
}

/**
 * The fixture bundles this suite draws on, named as `scripts/baseline-pages.mjs` writes them
 * (the bundle's filename, minus `.json`). Picked for what each one actually contains, not for
 * being the "main" fixture — see the comment on each.
 */
export const FIXTURES = {
  /** Small, hand-built: two flagged findings, one unknown, one finished, one direct requirement
   *  pulling in a flagged transitive with nothing else pulling it in. Deterministic enough to
   *  assert exact counts and exact rendered order against. The default fixture for most specs. */
  mini: "mini",
  /** A single `ok` finding with no `details` entry (K1: `details` can be `[]`) and a measured
   *  libyears value with no explanatory metadata — exercises the "no details" and "nothing
   *  flagged" shapes without an empty lock. */
  miniSplit: "mini-split",
  /** Zero packages, zero findings: the actually-empty lock (M20). */
  empty: "empty-lockrot-self",
  /** A real, large corpus (271 findings, 69 flagged) that happens to carry an S10 signal, a
   *  security advisory (S9), and a direct requirement whose card counts itself but does not list
   *  itself (M25). Used wherever a behaviour needs data `mini` is too small to contain. */
  wallabag: "wallabag_wallabag",
  /** Carries one finding with a Packagist-validated `replacement` (most fixtures have none). */
  mautic: "mautic_mautic",
} as const;
export type FixtureName = (typeof FIXTURES)[keyof typeof FIXTURES];
