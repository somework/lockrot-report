/**
 * `Wire*` is what arrives, every field optional; `Model` is what `normalize()` hands the rest of
 * the code, every field present, so nothing outside src/model/ checks for `undefined`. Enumerations
 * are open: an unknown value is kept and rendered neutrally, never dropped.
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
  /** One entry per `notes` string, at the same index; empty when the document types none. Identify an
   *  entry by its index: a code repeats once per forge, repository or parent. */
  noteDetails: readonly NoteDetail[];
  /** Null where the run carries no `fail_on`, and where the document predates the key (`absent`). */
  gate: RootGate | null;
  /** A flagged transitive package counts under each direct requirement that reaches it only when at
   *  most `maxFanIn` do. */
  exposureRule: ExposureRule | null;
  /** Flagged packages reached from more than `maxFanIn` direct requirements: in no `exposure` entry
   *  and no S7. */
  unattributed: readonly UnattributedEntry[];
  /** The keys the page reads that the document leaves out entirely; a key written as `null` is the
   *  document's own answer, not absent. */
  absent: readonly string[];
  /** In document order, which lockrot sorts: priority desc, verdict severity desc, direct first, name. */
  findings: readonly Finding[];
}

export interface RootGate {
  fails: boolean | null;
  /** Each cause once, as written; an unknown one is another condition that failed the run. */
  trippedBy: readonly string[];
  /** False in a run that judges no finding (`generate_baseline`). */
  failOnApplied: boolean | null;
}

export interface NoteDetail {
  /** Open: an unknown code is shown by its `text`, and its `data` is not read. */
  code: string;
  text: string;
  /** Linked as written, never built. */
  docsUrl: string | null;
  setsNetworkFailures: boolean | null;
  data: Readonly<Record<string, unknown>>;
}

export interface ExposureRule {
  maxFanIn: number;
}

export interface UnattributedEntry {
  package: string;
  /** As written; an unknown verdict is kept as its string. */
  verdict: Verdict;
  /** How many direct requirements of this run reach the package; null when unreadable. */
  fanIn: number | null;
}

export interface RunSettings {
  /** What the report calls this project (composer.json's `name`, or `extra.lockrot.project`). */
  project: string | null;
  /** What Composer calls this project, the manifest's `name`. */
  rootPackage: string | null;
  /** The project's own `require.php`: a constraint as written, not a version. */
  projectPhp: string | null;
  targetPhp: string | null;
  lockFile: string | null;
  failOn: string | null;
  /** Which kind of threshold `failOn` is, as written; null where `failOn` is. */
  failOnKind: string | null;
  /** As written: `check`, `generate_baseline`, or a kind of run this page does not know. */
  mode: string | null;
  strictNetwork: boolean | null;
  /** In document key order, e.g. `release-warn-years → 2`. Empty when the run recorded none. */
  thresholds: readonly (readonly [name: string, years: number])[];
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
  /** A valid Composer package name lockrot resolved as the successor. */
  replacement: string | null;
  /** The successor's page, as lockrot wrote it; null when it wrote none or the document predates it. */
  replacementUrl: string | null;
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
  /** False: no repository was asked, so no metadata, advisories, activity or libyears. */
  fromComposerRepository: boolean | null;
  /** Where the lock entry came from; null where the document does not say. */
  origin: PackageOrigin | null;
  /** Why `libyears` is null, as written; null when measured or when no field says why. */
  libyearsUnmeasured: string | null;
  /** How lockrot reached `priority`; null when the document does not say. */
  priorityBasis: PriorityBasis | null;
  /** The advisories no fix is expected for. Null: no prediction (the verdict makes none, or the
   *  document does not say); `[]`: a prediction that every advisory is fixed within reach. */
  noFixExpected: readonly NoFixAdvisory[] | null;
  /** Where this finding stands against `run.fail_on`; null exactly where the report's `gate` is. */
  gate: FindingGate | null;
}

export interface PackageOrigin {
  /** As written: `packagist`, `composer`, `path`, `vcs`, `artifact`, `package`, `unknown`, or a kind
   *  this page does not know (`<vendor>:<name>` included). */
  kind: string | null;
  /** A label, never a URL template. Null is "not named", never packagist.org. */
  registry: string | null;
  /** Linked as written, never built from the name or the registry. */
  packageUrl: string | null;
  /** True: Composer installed it from the machine it ran on. */
  local: boolean | null;
}

export interface PriorityBasis {
  base: Priority;
  steps: readonly PriorityBasisStep[];
}

export interface PriorityBasisStep {
  /** As written: `transitive`, `unreached`, `dev`, `no_fix_expected`, or one this page does not know. */
  reason: string;
  /** Equal to `to` when the step could not move the level. */
  from: Priority;
  to: Priority;
}

export interface NoFixAdvisory {
  /** An S9 advisory's `id` on the same finding. */
  id: string;
  /** As written; `releases_unknown` means no fix was looked for, not that none will come. */
  reason: string;
}

export interface FindingGate {
  reachesFailOn: boolean | null;
  fails: boolean | null;
  /** As written: `baseline`, or an exemption this page does not know. */
  exemptBy: string | null;
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
  /** Its S9's `releases_read`. False: no release was checked, so a null `fixedBy` is not "no fix". */
  releasesRead: boolean | null;
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
  fromComposerRepository: boolean | null;
  dev: boolean;
  branchSnapshot: boolean | null;
  type: string | null;
}

export interface ExplainMetadata {
  abandoned: boolean;
  /** The repository's free text; not necessarily a package name (compare Finding.replacement). */
  replacement: string | null;
  releasesListed: number | null;
  hasStableRelease: boolean | null;
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
  /** The requirement of the branch's newest dated release (not of the locked version). */
  php: string | null;
  // `null` below is no answer, never admitted or not admitted.
  /** Whether `php` admits some version of the target minor. */
  admitsTargetPhp: boolean | null;
  /** Whether `php` admits the lowest PHP the project's `require.php` promises. */
  admitsProjectPhp: boolean | null;
  /** Which floor S8's admission test names, as written (`project`, `target`, or a newer value). */
  phpBlockedBy: string | null;
  /** Which side of the target PHP `php` is on when it does not admit it, as written. */
  missesTargetPhp: string | null;
  /** Which side of the project's floor `php` is on when it does not admit it, as written. */
  missesProjectPhp: string | null;
  /** False when none of the five keys above is written: a document before 0.13.0 says nothing. */
  floorFields: boolean;
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
