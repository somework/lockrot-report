/**
 * The document the page renders, in two shapes.
 *
 * `Wire*` is what arrives: lockrot's `--format=html` payload `{report, details}`, where `report` is
 * exactly the `--format=json` document (resources/lockrot-report.schema.json in lockrot) and
 * `details` is a per-package extract of the `--explain` document. Everything is optional there,
 * because the page also renders documents written by older lockrot releases and documents an
 * embedder hands it.
 *
 * `Model` is what the rest of the code sees, produced by `normalize()`: every field present, older
 * shapes folded into the current one, absent values as `null` or an empty collection. Nothing
 * outside src/model/ checks for `undefined`.
 *
 * Enumerations are open on purpose. A verdict, signal id or severity this renderer does not know is
 * kept as its string and rendered neutrally — a newer lockrot must never produce a blank page.
 */

export const VERDICTS = [
  "abandoned",
  "silent",
  "pinned",
  "left-behind",
  "old-promise",
  "stale",
  "unknown",
  "finished",
  "ok",
] as const;
export type KnownVerdict = (typeof VERDICTS)[number];
/** A verdict string; one of VERDICTS for every document this renderer was written against. */
export type Verdict = KnownVerdict | (string & {});

export const PRIORITIES = ["critical", "high", "medium", "low", "none"] as const;
export type KnownPriority = (typeof PRIORITIES)[number];
export type Priority = KnownPriority | (string & {});

export const SIGNAL_IDS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"] as const;
export type KnownSignalId = (typeof SIGNAL_IDS)[number];
export type SignalId = KnownSignalId | (string & {});

export type SignalLevel = "info" | "warn" | "high" | (string & {});

/** The named severity buckets the page groups advisories into; see domain/severity.ts. */
export const SEVERITIES = ["critical", "high", "medium", "low", "unrated"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const VIEWS = ["findings", "advisories", "packages", "radius", "run"] as const;
export type View = (typeof VIEWS)[number];

// ---------------------------------------------------------------------------------------------
// Normalised model
// ---------------------------------------------------------------------------------------------

export interface Model {
  report: ReportModel;
  /** Keyed by package name. Empty when the run kept no facts (install time) or explained nothing. */
  details: ReadonlyMap<string, PackageDetails>;
  /** `report.lockrot.schema` when the document states it, else 1. */
  schema: number;
  /** True when `schema` is newer than this renderer reads; the page says so. */
  newerSchema: boolean;
}

export interface ReportModel {
  /** `$schema`, or the published report-1 URL. */
  schemaUrl: string;
  tool: { version: string | null; schema: number | null };
  /** ISO 8601. The instant every "N years ago" on the page is measured from. */
  generatedAt: string;
  run: RunSettings;
  activityCacheOldestAt: string | null;
  packagesChecked: number | null;
  includeDev: boolean | null;
  notFromComposerRepository: number | null;
  networkFailures: boolean | null;
  /** Count per verdict; every key of VERDICTS present (0 when absent), plus any unknown verdict. */
  counts: Readonly<Record<string, number>>;
  abandoned: { total: number; withReplacement: number } | null;
  /** Count per priority; every key of PRIORITIES present. */
  priorities: Readonly<Record<string, number>>;
  /** Direct requirements that pull in flagged packages, most first. */
  exposure: readonly { package: string; flagged: number }[];
  libyears: LibyearsBlock | null;
  baseline: BaselineSummary | null;
  notes: readonly string[];
  /**
   * The report-level and `run.` keys this page reads that the document does not carry at all, in
   * `ABSENT_CHECKED` order (normalize.ts) — `run.fail_on` for a document written before that field.
   * A key present with a `null` value is not absent: that is the document's own answer. Empty for
   * a document that carries every one.
   */
  absent: readonly string[];
  /** In document order, which lockrot sorts: priority desc, verdict severity desc, direct first, name. */
  findings: readonly Finding[];
}

export interface RunSettings {
  project: string | null;
  targetPhp: string | null;
  lockFile: string | null;
  failOn: string | null;
  /** In document key order, e.g. `release-warn-years → 2`. Empty when the run recorded none. */
  thresholds: readonly (readonly [name: string, years: number])[];
  /**
   * The verdicts that count as findings, as lockrot defines them. Falls back to the six flagged
   * verdicts for documents that do not carry it.
   */
  flaggedVerdicts: readonly Verdict[];
}

export interface LibyearsBlock {
  total: number | null;
  directRequirements: number | null;
  measured: number;
  /** Reason key → count, document order; every reason lockrot knows is present, zero-filled. */
  unmeasured: readonly (readonly [reason: string, count: number])[];
  furthestBehind: { package: string; version: string; libyears: number } | null;
}

export interface BaselineSummary {
  path: string;
  known: number;
  new: number;
  worsened: number;
  stale: readonly string[];
}

export interface Finding {
  package: string;
  version: string;
  verdict: Verdict;
  priority: Priority;
  direct: boolean;
  dev: boolean;
  /** A valid Composer package name lockrot resolved as the successor; links to Packagist. */
  replacement: string | null;
  signals: readonly Signal[];
  /** Direct requirement → … → this package. Empty when unreachable from any direct requirement. */
  chain: readonly string[];
  directDependents: readonly string[];
  /** One string; the legacy array form is joined with " · " by normalize(). */
  evidence: string;
  allowlistReason: string | null;
  note: string | null;
  dataDate: string | null;
  /** null when not measured, or when the document predates the field. */
  libyears: number | null;
  baseline: { status: "known" | "new" | "worsened" | (string & {}); previousVerdict: Verdict | null } | null;
  /** Every advisory of every S9 signal, flattened, in document order. */
  advisories: readonly Advisory[];
}

export interface Signal {
  id: SignalId;
  level: SignalLevel;
  summary: string;
  /** Shape depends on the id; the page lists it generically and reads named keys only through domain/. */
  data: Readonly<Record<string, unknown>>;
}

export interface Advisory {
  id: string;
  cve: string | null;
  title: string | null;
  link: string | null;
  /** Free text from the advisory feed, as written. */
  severityRaw: string | null;
  /** The bucket the page files it under (domain/severity.ts). */
  severity: Severity;
  reportedAt: string | null;
  affectedVersions: string | null;
  fixedBy: string | null;
  fixedOnBranch: boolean;
}

export interface PackageDetails {
  metadata: ExplainMetadata | null;
  lock: ExplainLock | null;
  activity: ExplainActivity | null;
  /** http(s) URL lockrot already stripped of credentials; the page re-checks it before linking. */
  repositoryLink: string | null;
}

export interface ExplainLock {
  php: string | null;
  released: string | null;
  repository: string | null;
  fromComposerRepository: boolean;
  dev: boolean;
  branchSnapshot: boolean;
  type: string | null;
}

export interface ExplainMetadata {
  abandoned: boolean;
  /** Packagist's free text; not necessarily a package name (compare Finding.replacement). */
  replacement: string | null;
  releasesListed: number | null;
  hasStableRelease: boolean;
  lastStableRelease: string | null;
  lastStableVersion: string | null;
  lastStableDatedBy: string | null;
  installedRelease: string | null;
  installedReleaseDatedBy: string | null;
  repository: string | null;
  type: string | null;
  dataDate: string | null;
  /** Highest branch first. */
  branches: readonly BranchRow[];
}

export interface BranchRow {
  branch: string;
  installed: boolean;
  highest: string;
  highestReleased: string | null;
  highestCommitDate: string | null;
  newestDated: string | null;
  newestDatedReleased: string | null;
  datedBy: string | null;
  php: string | null;
}

export interface ExplainActivity {
  forge: string | null;
  repository: string | null;
  archived: boolean;
  pushedAt: string | null;
  fetchedAt: string | null;
  fromCache: boolean;
}

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** Why a payload cannot be rendered at all. `message` is shown to the reader as is. */
export interface NormalizeError {
  kind: "not-json" | "not-a-report";
  message: string;
}
