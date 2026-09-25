/**
 * Where the renderer's built pages live, and which fixture bundle each test file was written
 * against. There is no baseURL (DESIGN.md §6: the suite runs against `file://` pages), so every
 * URL here is an absolute file path turned into a `file://` URL.
 *
 * Through lockrot 0.11.0 this suite also ran against `build/legacy-pages/` (lockrot's hand-written
 * page, selected by `RENDERER=legacy`) as the parity reference it was proven against while the
 * renderer was extracted. lockrot 0.12.0 stopped shipping that page, so the comparison target is
 * gone; the suite now runs against `build/pages/` only. DESIGN.md §5 keeps the record of the
 * differences that comparison found and fixed on purpose.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
/** e2e/support -> e2e -> repo root. */
export const REPO_ROOT = join(HERE, "..", "..");

const PAGES_DIR = join(REPO_ROOT, "build/pages");

/** The `file://` URL for one fixture's built page. */
export function pageUrl(fixture: FixtureName): string {
  return "file://" + join(PAGES_DIR, fixture + ".html");
}

/**
 * The fixture bundles this suite draws on, named as `scripts/pages.mjs` writes them (the bundle's
 * filename, minus `.json`). Picked for what each one actually contains, not for being the "main"
 * fixture — see the comment on each.
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
  /** `network_failures: true` and a note naming the advisory check, zero advisories in the
   *  document — the AdvisoryLedger's "check may be incomplete" case (PD-LEDGER-1, DESIGN.md §5),
   *  which none of the other fixtures carry. */
  advisoryIncomplete: "mini-advisory-incomplete",
  /** Hand-built: six advisories on five packages — each fix shape, a CVE and none, prod and dev,
   *  an unrated severity, one on an `ok` package — dated from a month to 2.6 years before the run.
   *  The Advisories ledger's fixture (PD-ADV-1..4, DESIGN.md §5); wallabag carries only one package
   *  and one fix shape. */
  miniAdvisories: "mini-advisories",
  /** A real corpus with release branches that are just past tags (daverandom/resume has no
   *  maintained branch at all, only versions named after themselves) — the timeline fixture
   *  PD-TIMELINE-3/4 (DESIGN.md §5) need, which `wallabag` and `mautic` don't carry. */
  koel: "koel_koel",
} as const;
export type FixtureName = (typeof FIXTURES)[keyof typeof FIXTURES];
