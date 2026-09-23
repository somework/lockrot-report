/**
 * unknown → Model, in one place.
 *
 * Every wire shape this renderer must survive lands here: the current `--format=html` bundle
 * `{report, details}`, a bare `--format=json` document handed to it directly, older lockrot
 * releases that omit fields added later, and documents a hostile or merely careless embedder
 * wrote by hand. Nothing downstream of `normalize()` checks for `undefined` or guards against the
 * wrong JSON type turning up where a string or array was expected (DESIGN.md §2) — this module is
 * the one place that does, so it never throws no matter what `unknown` turns out to be.
 */

import type {
  Advisory,
  BaselineSummary,
  BranchRow,
  ExplainActivity,
  ExplainLock,
  ExplainMetadata,
  Finding,
  LibyearsBlock,
  Model,
  NormalizeError,
  PackageDetails,
  ReportModel,
  RunSettings,
  Signal,
  Verdict,
} from "./types";
import { PRIORITIES, VERDICTS } from "./types";
import { normalizeSeverity } from "../domain/severity";
import { DEFAULT_FLAGGED } from "../domain/vocab";

export type NormalizeResult = { ok: true; model: Model } | { ok: false; error: NormalizeError };

/** The published report-1 schema URL, used when a document carries no `$schema` of its own. */
const DEFAULT_SCHEMA_URL = "https://lockrot.dev/schema/report-1.json";

/** Every libyears "why not measured" reason lockrot currently knows, in document order (contract.md §2.2). */
const LIBYEARS_UNMEASURED_REASONS = [
  "branch_snapshot",
  "no_stable_release_date",
  "not_from_composer_repository",
  "metadata_unavailable",
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

/**
 * The html bundle `{report, details}` is one shape; a bare `--format=json` document is another,
 * distinguished only by the absence of a `report` key alongside the presence of `lockrot` and
 * `findings` (which `report` itself always carries, DESIGN.md §3 / model/types.ts). Anything else
 * is not a report this renderer can read.
 */
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
    findings: asArray(source.findings).map(buildFinding),
  };
}

function buildRunSettings(raw: unknown): RunSettings {
  const rec = isRecord(raw) ? raw : {};
  return {
    project: asNullableString(rec.project),
    targetPhp: asNullableString(rec.target_php),
    lockFile: asNullableString(rec.lock_file),
    failOn: asNullableString(rec.fail_on),
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

/**
 * Mirrors the legacy `RUN.flagged_verdicts || FLAGGED_VERDICTS` (critic.md K5): only a missing,
 * null or non-array value falls back — an explicit empty array is a document's own answer and is
 * kept as given, exactly like the page it replaces. The fallback is `domain/vocab`'s
 * `DEFAULT_FLAGGED` itself, not a second list hand-copied here that could drift from it (quality
 * finding: this module used to keep its own `FLAGGED_VERDICTS_FALLBACK` literal).
 */
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
  };
}

/** The pre-string legacy shape (critic.md K5): an array of evidence lines joined the same way the old page did. */
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

/** Every advisory of every S9 signal on this finding, flattened, in document order (DESIGN.md, task spec). */
function flattenAdvisories(signals: readonly Signal[]): readonly Advisory[] {
  const advisories: Advisory[] = [];
  for (const signal of signals) {
    if (signal.id !== "S9") {
      continue;
    }
    for (const raw of asArray(signal.data.advisories)) {
      advisories.push(buildAdvisory(raw));
    }
  }
  return advisories;
}

function buildAdvisory(raw: unknown): Advisory {
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
  };
}

// ---------------------------------------------------------------------------------------------
// details
// ---------------------------------------------------------------------------------------------

/** `details` arrives as `{}`, `[]` (critic.md K1 — PHP's empty array serialises the same as an empty list) or absent. */
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
    // Mirrors legacy's `lock.from_composer_repository !== false` (`links.ts`'s own doc comment,
    // and `packagistUrl`): only an *explicit* `false` suppresses the Packagist link, so a lock
    // object missing the key entirely — every real document has carried it since be6d91f, but a
    // hand-built or edited one might not — still gets a link, not none.
    fromComposerRepository: asBoolean(raw.from_composer_repository, true),
    dev: asBoolean(raw.dev, false),
    branchSnapshot: asBoolean(raw.branch_snapshot, false),
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
    hasStableRelease: asBoolean(raw.has_stable_release, false),
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
  };
}

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

/**
 * Never drop a package or version silently just because a hand-written or foreign document put a
 * number, a boolean or an object where a string belongs (the task spec is explicit about this for
 * `finding.package`/`finding.version`, and the same reasoning applies anywhere else a wire string
 * turns out not to be one): coerce it to readable text instead of throwing it away.
 */
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
  // Anything else reads as its JSON, so a wrong-typed field still shows what it held. JSON cannot
  // carry functions or symbols (stringify gives undefined) and throws on cycles; neither can come
  // out of JSON.parse, so both read as empty rather than as "[object Object]".
  try {
    const json = JSON.stringify(value) as string | undefined;
    return json ?? "";
  } catch {
    return "";
  }
}
