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
  /** `mini-advisories` with `network_failures: true` and a note naming the advisory check: advisories
   *  found by a check that may not have run for every package (PD-ADV-5, DESIGN.md §5). */
  miniAdvisoriesPartial: "mini-advisories-partial",
  /** A real corpus with release branches that are just past tags (daverandom/resume has no
   *  maintained branch at all, only versions named after themselves) — the timeline fixture
   *  PD-TIMELINE-3/4 (DESIGN.md §5) need, which `wallabag` and `mautic` don't carry. */
  koel: "koel_koel",
  /** Synthetic: `wallabag` with a baseline laid over it (no real run produced it) — `run.fail_on:
   *  high`, `lockrot-baseline.json` accepting 63 flagged findings, 4 new (sensio/framework-extra-
   *  bundle, lcobucci/jwt, smalot/pdfparser, sebastian/type), 2 worsened (javibravo/simpleue from
   *  stale, symfony/web-server-bundle from left-behind), 3 stale entries no longer in the lock.
   *  The baseline surfaces' fixture (PD-BASELINE-1..4, DESIGN.md §5); no real fixture carries one. */
  wallabagBaseline: "wallabag_baseline",

  // lockrot 0.13.0 bundles, next to the 0.11 ones above (which stay as the older-document
  // regression guard). Built at lockrot `7ff0ec3`; what each holds is counted in lockrot's
  // `.private/handoff/0.13-fixtures/census.md`.
  /** wallabag at 0.13: branch rows with `admits_*` / `php_blocked_by` / `misses_*`, S6 with
   *  `reason` and `has_stable_release`, `run.root_package` and `run.project_php` (`>=8.2`), S8
   *  pointing below the newest branch 11 times (`floor_source: project`), `unattributed: []`. */
  wallabag013: "wallabag_wallabag-0.13",
  /** koel at 0.13: S6 on a `finished` package with no details (roave/security-advisories). */
  koel013: "koel_koel-0.13",
  /** koel at 0.13, `--all`: 155 packages with branch rows, the only real `php_blocked_by: target`
   *  rows among the four projects (nette/utils 3.x); no S6 at all. */
  koelAll013: "koel_koel-all-0.13",
  /** mautic at 0.13: `run.project_php: null`, so `admits_project_php` is null on every row. */
  mautic013: "mautic_mautic-0.13",
  /** akaunting at 0.13: the only real `unattributed` entry (league/config, stale, fan_in 9). */
  akaunting013: "gh_akaunting_akaunting-0.13",
  /** Hand-built 0.13 edges: S6 `no_stable_release`, `has_stable_release: null`, unknown values in
   *  every open vocabulary (S99, `acme:licence`, S10 check/reason, `floor_source`, `php_blocked_by`,
   *  a `misses_*` side), every `misses_*` side, `root_package` differing from `project`, and an
   *  `unattributed` entry. */
  miniEdges013: "mini-0.13-edges",
  /** The lock-only twin: `project`, `root_package`, `project_php` all null, every chain empty. */
  miniEdgesLockOnly013: "mini-0.13-edges-lock-only",
} as const;
export type FixtureName = (typeof FIXTURES)[keyof typeof FIXTURES];
