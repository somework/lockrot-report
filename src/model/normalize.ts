/**
 * unknown → Model, in one place, never throwing: the `{report, details}` bundle, a bare
 * `--format=json` document, a key left out, or a wrong JSON type (DESIGN.md §2).
 */

import type {
  Advisory,
  BaselineSummary,
  BranchRow,
  ExplainActivity,
  ExplainLock,
  ExplainMetadata,
  ExposureRule,
  Finding,
  FindingGate,
  LibyearsBlock,
  Model,
  NoFixAdvisory,
  NormalizeError,
  NoteDetail,
  PackageDetails,
  PackageOrigin,
  PriorityBasis,
  ReportModel,
  RootGate,
  RunSettings,
  Signal,
  UnattributedEntry,
  Verdict,
} from "./types";
import { PRIORITIES, VERDICTS } from "./types";
import { normalizeSeverity } from "../domain/severity";
import { DEFAULT_FLAGGED } from "../domain/vocab";

export type NormalizeResult = { ok: true; model: Model } | { ok: false; error: NormalizeError };

/** The published report-1 schema URL, used when a document carries no `$schema` of its own. */
const DEFAULT_SCHEMA_URL = "https://lockrot.dev/schema/report-1.json";

/** Every libyears "why not measured" reason lockrot knows, in its order. */
const LIBYEARS_UNMEASURED_REASONS = [
  "branch_snapshot",
  "no_stable_release_date",
  "not_from_composer_repository",
  "metadata_unavailable",
] as const;

/** The report-level and `run.` keys the page reads that a document may leave out; nothing here
 *  knows which release added which key. */
const ABSENT_CHECKED = [
  "packages_checked",
  "include_dev",
  "network_failures",
  "activity_cache_oldest_at",
  "not_from_composer_repository",
  "abandoned",
  "libyears",
  "baseline",
  "notes",
  "counts",
  "priorities",
  "exposure",
  "exposure_rule",
  "unattributed",
  "note_details",
  "gate",
  "run.project",
  "run.root_package",
  "run.project_php",
  "run.lock_file",
  "run.target_php",
  "run.fail_on",
  "run.fail_on_kind",
  "run.mode",
  "run.strict_network",
  "run.thresholds",
  "run.flagged_verdicts",
] as const;

const NOT_A_REPORT_MESSAGE =
  "This does not look like a lockrot report. Expected either the html bundle " +
  "({report, details}) or a --format=json document (with 'lockrot' and 'findings').";

const NO_GENERATED_AT_MESSAGE =
  "This report has no readable 'generated_at' date, so ages and the timeline cannot be shown.";

// ---------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------

export function normalize(input: unknown): NormalizeResult {
  if (!isRecord(input)) {
    return notAReport(NOT_A_REPORT_MESSAGE);
  }

  const shape = pickReportShape(input);
  if (shape === null) {
    return notAReport(NOT_A_REPORT_MESSAGE);
  }

  const generatedAt = asNullableString(shape.reportSource.generated_at);
  if (generatedAt === null || Number.isNaN(Date.parse(generatedAt))) {
    return notAReport(NO_GENERATED_AT_MESSAGE);
  }

  const lockrot = shape.reportSource.lockrot;
  const schema = asFiniteNumber(isRecord(lockrot) ? lockrot.schema : undefined) ?? 1;

  return {
    ok: true,
    model: {
      report: buildReportModel(shape.reportSource, generatedAt),
      details: buildDetailsMap(shape.detailsSource),
      schema,
      newerSchema: schema > 1,
    },
  };
}

export function parseBundle(text: string): NormalizeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: { kind: "not-json", message: "This file is not valid JSON." } };
  }
  return normalize(parsed);
}

function notAReport(message: string): NormalizeResult {
  return { ok: false, error: { kind: "not-a-report", message } };
}

// ---------------------------------------------------------------------------------------------
// Which of the three accepted shapes this input is
// ---------------------------------------------------------------------------------------------

interface ReportShape {
  reportSource: Record<string, unknown>;
  detailsSource: unknown;
}

/** A bare `--format=json` document has no `report` key but carries `lockrot` and `findings`. */
function pickReportShape(input: Record<string, unknown>): ReportShape | null {
  if ("report" in input) {
    return isRecord(input.report) ? { reportSource: input.report, detailsSource: input.details } : null;
  }
  if (isRecord(input.lockrot) && "findings" in input) {
    return { reportSource: input, detailsSource: undefined };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------

function buildReportModel(source: Record<string, unknown>, generatedAt: string): ReportModel {
  const lockrot = isRecord(source.lockrot) ? source.lockrot : {};

  return {
    schemaUrl: asString(source["$schema"], DEFAULT_SCHEMA_URL),
    tool: {
      version: asNullableString(lockrot.version),
      schema: asFiniteNumber(lockrot.schema),
    },
    generatedAt,
    run: buildRunSettings(source.run),
    activityCacheOldestAt: asNullableString(source.activity_cache_oldest_at),
    packagesChecked: asFiniteNumber(source.packages_checked),
    includeDev: asNullableBoolean(source.include_dev),
    notFromComposerRepository: asFiniteNumber(source.not_from_composer_repository),
    networkFailures: asNullableBoolean(source.network_failures),
    counts: zeroFillCounts(source.counts, VERDICTS),
    abandoned: buildAbandoned(source.abandoned),
    priorities: zeroFillCounts(source.priorities, PRIORITIES),
    exposure: buildExposure(source.exposure),
    libyears: buildLibyears(source.libyears),
    baseline: buildBaseline(source.baseline),
    notes: asStringArray(source.notes),
    noteDetails: asArray(source.note_details).map(buildNoteDetail),
    gate: buildRootGate(source.gate),
    exposureRule: buildExposureRule(source.exposure_rule),
    unattributed: buildUnattributed(source.unattributed),
    absent: absentKeys(source),
    findings: asArray(source.findings).map(buildFinding),
  };
}

/** `in`, not a null check: a key written as `null` is present. */
function absentKeys(source: Record<string, unknown>): readonly string[] {
  const run = isRecord(source.run) ? source.run : {};
  return ABSENT_CHECKED.filter((key) => (key.startsWith("run.") ? !(key.slice(4) in run) : !(key in source)));
}

function buildRunSettings(raw: unknown): RunSettings {
  const rec = isRecord(raw) ? raw : {};
  return {
    project: asNullableString(rec.project),
    rootPackage: asNullableString(rec.root_package),
    projectPhp: asNullableString(rec.project_php),
    targetPhp: asNullableString(rec.target_php),
    lockFile: asNullableString(rec.lock_file),
    failOn: asNullableString(rec.fail_on),
    failOnKind: asNullableString(rec.fail_on_kind),
    mode: asNullableString(rec.mode),
    strictNetwork: asNullableBoolean(rec.strict_network),
    thresholds: buildThresholds(rec.thresholds),
    flaggedVerdicts: buildFlaggedVerdicts(rec.flagged_verdicts),
  };
}

function buildThresholds(raw: unknown): readonly (readonly [string, number])[] {
  if (!isRecord(raw)) {
    return [];
  }
  const thresholds: (readonly [string, number])[] = [];
  for (const [name, value] of Object.entries(raw)) {
    const years = asFiniteNumber(value);
    if (years !== null) {
      thresholds.push([name, years]);
    }
  }
  return thresholds;
}

/** An empty list is the document's own answer; only a value that is not a list falls back. */
function buildFlaggedVerdicts(raw: unknown): readonly Verdict[] {
  if (!isArray(raw)) {
    return DEFAULT_FLAGGED;
  }
  return raw.map((value) => asCoercedString(value));
}

function zeroFillCounts(raw: unknown, knownKeys: readonly string[]): Readonly<Record<string, number>> {
  const rec = isRecord(raw) ? raw : {};
  const result: Record<string, number> = {};
  for (const key of knownKeys) {
    result[key] = asFiniteNumber(rec[key]) ?? 0;
  }
  for (const [key, value] of Object.entries(rec)) {
    if (!(key in result)) {
      result[key] = asFiniteNumber(value) ?? 0;
    }
  }
  return result;
}

function buildAbandoned(raw: unknown): { total: number; withReplacement: number } | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    total: asFiniteNumber(raw.total) ?? 0,
    withReplacement: asFiniteNumber(raw.with_replacement) ?? 0,
  };
}

function buildExposure(raw: unknown): readonly { package: string; flagged: number }[] {
  return asArray(raw).map((item) => {
    const rec = isRecord(item) ? item : {};
    return { package: asCoercedString(rec.package), flagged: asFiniteNumber(rec.flagged) ?? 0 };
  });
}

/** `null` for a rule written as null or without a readable `max_fan_in`: no rule the page can quote. */
function buildExposureRule(raw: unknown): ExposureRule | null {
  if (!isRecord(raw)) {
    return null;
  }
  const maxFanIn = asFiniteNumber(raw.max_fan_in);
  return maxFanIn === null ? null : { maxFanIn };
}

function buildUnattributed(raw: unknown): readonly UnattributedEntry[] {
  return asArray(raw).map((item) => {
    const rec = isRecord(item) ? item : {};
    return {
      package: asCoercedString(rec.package),
      verdict: asCoercedString(rec.verdict),
      fanIn: asFiniteNumber(rec.fan_in),
    };
  });
}

function buildRootGate(raw: unknown): RootGate | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    fails: asNullableBoolean(raw.fails),
    trippedBy: asStringArray(raw.tripped_by),
    failOnApplied: asNullableBoolean(raw.fail_on_applied),
  };
}

function buildNoteDetail(raw: unknown): NoteDetail {
  const rec = isRecord(raw) ? raw : {};
  return {
    code: asCoercedString(rec.code),
    text: asCoercedString(rec.text),
    docsUrl: asNullableString(rec.docs_url),
    setsNetworkFailures: asNullableBoolean(rec.sets_network_failures),
    data: isRecord(rec.data) ? rec.data : {},
  };
}

function buildLibyears(raw: unknown): LibyearsBlock | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    total: asFiniteNumber(raw.total),
    directRequirements: asFiniteNumber(raw.direct_requirements),
    measured: asFiniteNumber(raw.measured) ?? 0,
    unmeasured: buildUnmeasured(raw.unmeasured),
    furthestBehind: buildFurthestBehind(raw.furthest_behind),
  };
}

function buildUnmeasured(raw: unknown): readonly (readonly [string, number])[] {
  const rec = isRecord(raw) ? raw : {};
  const seen = new Set<string>();
  const rows: (readonly [string, number])[] = [];
  for (const reason of LIBYEARS_UNMEASURED_REASONS) {
    rows.push([reason, asFiniteNumber(rec[reason]) ?? 0]);
    seen.add(reason);
  }
  for (const [reason, value] of Object.entries(rec)) {
    if (!seen.has(reason)) {
      rows.push([reason, asFiniteNumber(value) ?? 0]);
    }
  }
  return rows;
}

function buildFurthestBehind(raw: unknown): { package: string; version: string; libyears: number } | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    package: asCoercedString(raw.package),
    version: asCoercedString(raw.version),
    libyears: asFiniteNumber(raw.libyears) ?? 0,
  };
}

function buildBaseline(raw: unknown): BaselineSummary | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    path: asString(raw.path, ""),
    known: asFiniteNumber(raw.known) ?? 0,
    new: asFiniteNumber(raw.new) ?? 0,
    worsened: asFiniteNumber(raw.worsened) ?? 0,
    stale: asStringArray(raw.stale),
  };
}

// ---------------------------------------------------------------------------------------------
// findings
// ---------------------------------------------------------------------------------------------

function buildFinding(raw: unknown): Finding {
  const rec = isRecord(raw) ? raw : {};
  const signals = asArray(rec.signals).map(buildSignal);

  return {
    package: asCoercedString(rec.package),
    version: asCoercedString(rec.version),
    verdict: asCoercedString(rec.verdict),
    priority: asCoercedString(rec.priority),
    direct: asBoolean(rec.direct, false),
    dev: asBoolean(rec.dev, false),
    replacement: asNullableString(rec.replacement),
    replacementUrl: asNullableString(rec.replacement_url),
    signals,
    chain: asStringArray(rec.chain),
    directDependents: asStringArray(rec.direct_dependents),
    evidence: buildEvidence(rec.evidence),
    allowlistReason: asNullableString(rec.allowlist_reason),
    note: asNullableString(rec.note),
    dataDate: asNullableString(rec.data_date),
    libyears: asFiniteNumber(rec.libyears),
    baseline: buildFindingBaseline(rec.baseline),
    advisories: flattenAdvisories(signals),
    fromComposerRepository: asNullableBoolean(rec.from_composer_repository),
    origin: buildOrigin(rec.origin),
    libyearsUnmeasured: asNullableString(rec.libyears_unmeasured),
    priorityBasis: buildPriorityBasis(rec.priority_basis),
    noFixExpected: isArray(rec.no_fix_expected) ? rec.no_fix_expected.map(buildNoFixAdvisory) : null,
    gate: buildFindingGate(rec.gate),
  };
}

/** No basis without a readable `base`: a ladder needs somewhere to start. */
function buildPriorityBasis(raw: unknown): PriorityBasis | null {
  if (!isRecord(raw) || typeof raw.base !== "string") {
    return null;
  }
  return {
    base: raw.base,
    steps: asArray(raw.steps).map((step) => {
      const rec = isRecord(step) ? step : {};
      return {
        reason: asCoercedString(rec.reason),
        from: asCoercedString(rec.from),
        to: asCoercedString(rec.to),
      };
    }),
  };
}

function buildOrigin(raw: unknown): PackageOrigin | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    kind: asNullableString(raw.kind),
    registry: asNullableString(raw.registry),
    packageUrl: asNullableString(raw.package_url),
    local: asNullableBoolean(raw.local),
  };
}

function buildNoFixAdvisory(raw: unknown): NoFixAdvisory {
  const rec = isRecord(raw) ? raw : {};
  return { id: asCoercedString(rec.id), reason: asCoercedString(rec.reason) };
}

function buildFindingGate(raw: unknown): FindingGate | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    reachesFailOn: asNullableBoolean(raw.reaches_fail_on),
    fails: asNullableBoolean(raw.fails),
    exemptBy: asNullableString(raw.exempt_by),
  };
}

/** An array of evidence lines reads as one string. */
function buildEvidence(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (isArray(raw)) {
    return raw.map((line) => asCoercedString(line)).join(" · ");
  }
  return "";
}

function buildFindingBaseline(raw: unknown): Finding["baseline"] {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    status: asCoercedString(raw.status),
    previousVerdict: asNullableString(raw.previous_verdict),
  };
}

function buildSignal(raw: unknown): Signal {
  const rec = isRecord(raw) ? raw : {};
  return {
    id: asCoercedString(rec.id),
    level: asString(rec.level, "info"),
    summary: asCoercedString(rec.summary),
    data: isRecord(rec.data) ? rec.data : {},
  };
}

/** Every advisory of every S9 signal on this finding, in document order. */
function flattenAdvisories(signals: readonly Signal[]): readonly Advisory[] {
  const advisories: Advisory[] = [];
  for (const signal of signals) {
    if (signal.id !== "S9") {
      continue;
    }
    const releasesRead = asNullableBoolean(signal.data.releases_read);
    for (const raw of asArray(signal.data.advisories)) {
      advisories.push(buildAdvisory(raw, releasesRead));
    }
  }
  return advisories;
}

function buildAdvisory(raw: unknown, releasesRead: boolean | null): Advisory {
  const rec = isRecord(raw) ? raw : {};
  const severityRaw = asNullableString(rec.severity);
  return {
    id: asCoercedString(rec.id),
    cve: asNullableString(rec.cve),
    title: asNullableString(rec.title),
    link: asNullableString(rec.link),
    severityRaw,
    severity: normalizeSeverity(severityRaw),
    reportedAt: asNullableString(rec.reported_at),
    affectedVersions: asNullableString(rec.affected_versions),
    fixedBy: asNullableString(rec.fixed_by),
    fixedOnBranch: asBoolean(rec.fixed_on_branch, false),
    releasesRead,
  };
}

// ---------------------------------------------------------------------------------------------
// details
// ---------------------------------------------------------------------------------------------

/** `details` arrives as `{}`, `[]` (PHP writes an empty map as a list) or absent. */
function buildDetailsMap(raw: unknown): ReadonlyMap<string, PackageDetails> {
  if (!isRecord(raw)) {
    return new Map();
  }
  const details = new Map<string, PackageDetails>();
  for (const [pkg, value] of Object.entries(raw)) {
    details.set(pkg, buildPackageDetails(value));
  }
  return details;
}

function buildPackageDetails(raw: unknown): PackageDetails {
  const rec = isRecord(raw) ? raw : {};
  return {
    metadata: buildMetadata(rec.metadata),
    lock: buildLock(rec.lock),
    activity: buildActivity(rec.activity),
    repositoryLink: asNullableString(rec.repository_link),
  };
}

function buildLock(raw: unknown): ExplainLock | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    php: asNullableString(raw.php),
    released: asNullableString(raw.released),
    repository: asNullableString(raw.repository),
    fromComposerRepository: asNullableBoolean(raw.from_composer_repository),
    dev: asBoolean(raw.dev, false),
    branchSnapshot: asNullableBoolean(raw.branch_snapshot),
    type: asNullableString(raw.type),
  };
}

function buildMetadata(raw: unknown): ExplainMetadata | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    abandoned: asBoolean(raw.abandoned, false),
    replacement: asNullableString(raw.replacement),
    releasesListed: asFiniteNumber(raw.releases_listed),
    hasStableRelease: asNullableBoolean(raw.has_stable_release),
    lastStableRelease: asNullableString(raw.last_stable_release),
    lastStableVersion: asNullableString(raw.last_stable_version),
    lastStableDatedBy: asNullableString(raw.last_stable_dated_by),
    installedRelease: asNullableString(raw.installed_release),
    installedReleaseDatedBy: asNullableString(raw.installed_release_dated_by),
    repository: asNullableString(raw.repository),
    type: asNullableString(raw.type),
    dataDate: asNullableString(raw.data_date),
    branches: asArray(raw.branches).map(buildBranchRow),
  };
}

function buildBranchRow(raw: unknown): BranchRow {
  const rec = isRecord(raw) ? raw : {};
  return {
    branch: asCoercedString(rec.branch),
    installed: asBoolean(rec.installed, false),
    highest: asCoercedString(rec.highest),
    highestReleased: asNullableString(rec.highest_released),
    highestCommitDate: asNullableString(rec.highest_commit_date),
    newestDated: asNullableString(rec.newest_dated),
    newestDatedReleased: asNullableString(rec.newest_dated_released),
    datedBy: asNullableString(rec.dated_by),
    php: asNullableString(rec.php),
    admitsTargetPhp: asNullableBoolean(rec.admits_target_php),
    admitsProjectPhp: asNullableBoolean(rec.admits_project_php),
    phpBlockedBy: asNullableString(rec.php_blocked_by),
    missesTargetPhp: asNullableString(rec.misses_target_php),
    missesProjectPhp: asNullableString(rec.misses_project_php),
    floorFields: FLOOR_KEYS.some((key) => key in rec),
  };
}

const FLOOR_KEYS = [
  "admits_target_php",
  "admits_project_php",
  "php_blocked_by",
  "misses_target_php",
  "misses_project_php",
] as const;

function buildActivity(raw: unknown): ExplainActivity | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    forge: asNullableString(raw.forge),
    repository: asNullableString(raw.repository),
    archived: asBoolean(raw.archived, false),
    pushedAt: asNullableString(raw.pushed_at),
    fetchedAt: asNullableString(raw.fetched_at),
    fromCache: asBoolean(raw.from_cache, false),
  };
}

// ---------------------------------------------------------------------------------------------
// Defensive primitives — every one of these accepts a value of any wire type and never throws.
// ---------------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return isArray(value) ? value : [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): readonly string[] {
  return asArray(value).map((item) => asCoercedString(item));
}

/** A number, boolean or object where a string belongs becomes readable text, never a dropped row. */
function asCoercedString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // Neither a cycle nor a function can come out of JSON.parse; both read as empty.
  try {
    const json = JSON.stringify(value) as string | undefined;
    return json ?? "";
  } catch {
    return "";
  }
}
