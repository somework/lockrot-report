/**
 * Where the built pages live (`file://`, no baseURL) and which fixture bundle each test draws on.
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

/** Named as `scripts/pages.mjs` writes them, each picked for what it contains. */
export const FIXTURES = {
  /** Small and hand-built, deterministic enough to assert exact counts and order: the default
   *  fixture. */
  mini: "mini",
  /** An `ok` finding with no `details` entry and a measured libyears with no metadata. */
  miniSplit: "mini-split",
  /** Zero packages, zero findings: the actually-empty lock (M20). */
  empty: "empty-lockrot-self",
  /** A real, large corpus with an S10, an S9 and a direct requirement that counts itself but does
   *  not list itself. */
  wallabag: "wallabag_wallabag",
  /** Carries one finding with a resolved `replacement` (most fixtures have none). */
  mautic: "mautic_mautic",
  /** `network_failures: true` and no advisory: the Advisories ledger's "may be incomplete" case. */
  advisoryIncomplete: "mini-advisory-incomplete",
  /** Hand-built: every fix shape, a CVE and none, prod and dev, an unrated severity, one on an `ok`
   *  package. */
  miniAdvisories: "mini-advisories",
  /** Advisories found by a check that may not have run for every package (PD-ADV-5). */
  miniAdvisoriesPartial: "mini-advisories-partial",
  /** Release branches that are just past tags (daverandom/resume), for PD-TIMELINE-3/4. */
  koel: "koel_koel",
  /** Synthetic: `wallabag` with a baseline laid over it; no real fixture carries one. */
  wallabagBaseline: "wallabag_baseline",

  // lockrot 0.13.0 bundles; lockrot's `.private/handoff/0.13-fixtures/census.md` says what each
  // holds.
  /** Every 0.13 field: branch-row admission, S6 `reason`, `root_package`, `project_php`, S8 below
   *  the newest. */
  wallabag013: "wallabag_wallabag-0.13",
  /** koel at 0.13: S6 on a `finished` package with no details (roave/security-advisories). */
  koel013: "koel_koel-0.13",
  /** `--all`: the only real `php_blocked_by: target` rows; no S6. */
  koelAll013: "koel_koel-all-0.13",
  /** mautic at 0.13: `run.project_php: null`, so `admits_project_php` is null on every row. */
  mautic013: "mautic_mautic-0.13",
  /** akaunting at 0.13: the only real `unattributed` entry (league/config, stale, fan_in 9). */
  akaunting013: "gh_akaunting_akaunting-0.13",
  /** Hand-built: an unknown value in every open vocabulary, every `misses_*` side, an
   *  `unattributed` entry. */
  miniEdges013: "mini-0.13-edges",
  /** The lock-only twin: `project`, `root_package`, `project_php` all null, every chain empty. */
  miniEdgesLockOnly013: "mini-0.13-edges-lock-only",
  /** koel's lock without its composer.json: every transitive finding steps down as `unreached`;
   *  fail-on `critical`, which nothing reaches. */
  koelLockOnly013: "koel_lock-only-0.13",
  /** No GitHub token and fail-on `unchecked`: the anonymous-cap note, and every S10 finding fails. */
  koelNoTokenUnchecked013: "koel_no-token-unchecked-0.13",
  /** fail-on `high` against an older baseline: known, new, worsened and stale; fails by `fail_on`. */
  wallabagBaselineOlder013: "wallabag_baseline-older-0.13",
  /** fail-on `stale` against its own baseline: every finding that reaches is exempt; passes. */
  wallabagBaselineSelf013: "wallabag_baseline-self-0.13",
  /** `--generate-baseline`: findings reach fail-on, none fails (`fail_on_applied: false`). */
  wallabagGenerateBaseline013: "wallabag_generate-baseline-0.13",
  /** Offline with `--strict-network`: fails by `strict_network` alone; `metadata_unavailable`. */
  wallabagOfflineStrict013: "wallabag_offline-strict-0.13",
  /** Offline, strict, fail-on `unchecked`: fails by both causes. */
  wallabagOfflineStrictUnchecked013: "wallabag_offline-strict-unchecked-0.13",
  /** The full mini under other run policies: `--generate-baseline`, fail-on `none`, no fail-on at
   *  all (every gate null), `unchecked`, an unknown mode/kind/cause, and a verdict threshold. */
  miniGateGenerate013: "mini-0.13-gate-generate",
  miniGateNone013: "mini-0.13-gate-none",
  miniGateNull013: "mini-0.13-gate-null",
  miniGateUnchecked013: "mini-0.13-gate-unchecked",
  miniGateUnknown013: "mini-0.13-gate-unknown",
  miniGateVerdict013: "mini-0.13-gate-verdict",
  /** Synthetic: mini-0.13-edges with many `unattributed` entries, for the shared tail at the scale
   *  of a monorepo. */
  sharedMany: "synthetic-shared-many",
} as const;
export type FixtureName = (typeof FIXTURES)[keyof typeof FIXTURES];
