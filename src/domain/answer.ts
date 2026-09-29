/** The open package's answer sentence (PD-DETAIL-6), as typed parts: every clause restates a field
 *  the document carries, and a missing signal means fewer words, never a guess. */

import type { Finding, PackageDetails, Signal } from "../model/types";
import { yearsPhrase } from "./format";
import {
  ageSource,
  ageZone,
  pushThresholds,
  releaseThresholds,
  type AgeLegend,
  type Thresholds,
} from "./age";
import { pinnedKind, readPinnedFacts } from "./pinned";
import { safeHref } from "./links";
import { installedBranch, noFixTally, type NoFixTally } from "./priority";
import { WAYS_NAMED, waysIn } from "./reach";
import { VERDICT_ORDER, type Tone } from "./vocab";

export type AnswerPart =
  | { readonly kind: "text"; readonly text: string }
  /** A package, branch, version or constraint — set in mono. */
  | { readonly kind: "name"; readonly text: string }
  /** `tone` is an age's zone or the advisory count's weight; `null` leaves it in ink. */
  | { readonly kind: "figure"; readonly text: string; readonly tone: Tone | null }
  /** `href` is `replacement_url`, only for a package lockrot resolved. */
  | { readonly kind: "replacement"; readonly text: string; readonly href: string | null };

export interface AnswerInput {
  readonly finding: Finding;
  /** The repository's own free-text replacement (`metadata.replacement`), when the explain data has one. */
  readonly metadataReplacement: string | null;
  readonly thresholds: Thresholds;
  readonly details?: PackageDetails | null;
}

const text = (value: string): AnswerPart => ({ kind: "text", text: value });
const name = (value: string): AnswerPart => ({ kind: "name", text: value });
const figure = (value: string, tone: Tone | null): AnswerPart => ({ kind: "figure", text: value, tone });

function signal(finding: Finding, id: string): Signal | undefined {
  return finding.signals.find((s) => s.id === id);
}

function str(data: Signal["data"] | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function num(data: Signal["data"] | undefined, key: string): number | null {
  const value = data?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export { yearsPhrase };

/** In ink when the verdict does not rest on age or the run recorded no thresholds. */
function age(years: number, pair: AgeLegend | null, contextOnly: boolean): AnswerPart {
  const tone = contextOnly || pair === null ? null : ageZone(years, pair.warn, pair.high);
  return figure(yearsPhrase(years), tone);
}

const HOSTS: Readonly<Record<string, string>> = {
  "github.com": "GitHub",
  "gitlab.com": "GitLab",
  "bitbucket.org": "Bitbucket",
};

function hostName(host: string | null): string {
  if (host === null) return "its host";
  return Object.hasOwn(HOSTS, host) ? (HOSTS[host] ?? host) : host;
}

/** What the verdict is, in the words of the signals that set it. */
function verdictClause(
  finding: Finding,
  thresholds: Thresholds,
  details: PackageDetails | null,
): AnswerPart[] {
  const release = releaseThresholds(thresholds);
  const push = pushThresholds(thresholds);
  const s2 = num(signal(finding, "S2")?.data, "years");
  const s4 = num(signal(finding, "S4")?.data, "years");

  switch (finding.verdict) {
    case "abandoned":
      return abandonedClause(finding);
    case "silent": {
      if (s2 === null && s4 === null) return [text("Silent: no recent release and no recent push.")];
      const parts: AnswerPart[] = [text("Silent: ")];
      if (s2 !== null) parts.push(text("no release for "), age(s2, release, false));
      if (s2 !== null && s4 !== null) parts.push(text(" and "));
      if (s4 !== null) parts.push(text("no push for "), age(s4, push, false));
      parts.push(text("."));
      return parts;
    }
    case "pinned":
      return pinnedClause(finding, details);
    case "left-behind": {
      const s8 = signal(finding, "S8")?.data;
      const branch = str(s8, "branch");
      const years = num(s8, "years");
      const newest = str(s8, "newest_branch");
      if (branch === null || years === null) {
        return [text("Left behind on an older branch while a newer one kept releasing.")];
      }
      const parts: AnswerPart[] = [
        text("Left behind on "),
        name(branch),
        text(": its last release was "),
        age(years, release, false),
        text(" ago"),
      ];
      if (newest !== null) parts.push(text(" while "), name(newest), text(" kept releasing"));
      parts.push(text("."));
      return parts;
    }
    case "old-promise":
      return oldPromiseClause(finding);
    case "stale":
      if (s2 !== null) return [text("Stale: its last release was "), age(s2, release, false), text(" ago.")];
      if (s4 !== null) return [text("Stale: its last push was "), age(s4, push, false), text(" ago.")];
      return [text("Stale.")];
    case "finished": {
      // lockrot's allowlist entry says why the package is complete by design; the page quotes it.
      const reason = finding.allowlistReason?.trim().replace(/\.$/, "") ?? "";
      if (reason === "") return [text("On the allowlist as finished, so it is not flagged.")];
      return [text(`On the allowlist as finished, so it is not flagged: ${reason}.`)];
    }
    case "ok":
      return [text("Nothing flagged it.")];
    case "unknown":
      return [text("Not checked: lockrot could not read any data for it.")];
    default:
      return [text(`${finding.verdict.charAt(0).toUpperCase()}${finding.verdict.slice(1)}.`)];
  }
}

/** The newest dated tag is not named here: the Provenance metadata line is its one place. */
function pinnedClause(finding: Finding, details: PackageDetails | null): AnswerPart[] {
  const facts = readPinnedFacts(finding, details);
  const lead = [text("Pinned to "), name(facts.version)];
  switch (pinnedKind(facts)) {
    case "untagged":
      return [text("Installed "), name(facts.version), text(", but its repository lists no tag.")];
    case "other": {
      const summary = facts.summary?.trim().replace(/\.$/, "") ?? "";
      return summary === "" ? [...lead, text(".")] : [text(`Pinned: ${summary}.`)];
    }
    case "snapshot":
      return facts.hasStableRelease === false
        ? [...lead, text(", a branch snapshot of a package with no tagged release.")]
        : [...lead, text(", a branch snapshot rather than a release.")];
  }
}

/** The age is `ageSource`'s, so the sentence and the key facts never name two ages; in ink, since
 *  abandoned never rests on age. */
function abandonedClause(finding: Finding): AnswerPart[] {
  const marked = signal(finding, "S1") !== undefined;
  const s3 = signal(finding, "S3");
  const archived = s3 !== undefined ? `archived on ${hostName(str(s3.data, "host"))}` : null;
  const lead =
    marked && archived !== null
      ? `Marked abandoned upstream and ${archived}`
      : marked
        ? "Marked abandoned upstream"
        : archived !== null
          ? archived.charAt(0).toUpperCase() + archived.slice(1)
          : "Abandoned";
  const source = ageSource(finding);
  if (source === null) return [text(`${lead}.`)];
  const years = age(source.years, null, true);
  if (source.kind === "push") return [text(`${lead}, with no push for `), years, text(".")];
  if (source.kind === "branch") {
    const branch = str(signal(finding, "S8")?.data, "branch");
    if (branch !== null) {
      return [
        text(`${lead}; the branch you’re on, `),
        name(branch),
        text(", last released "),
        years,
        text(" ago."),
      ];
    }
  }
  return [text(`${lead}; its last release was `), years, text(" ago.")];
}

/** Old promise: S5's own release year, the PHP it was written for and the open constraint. */
function oldPromiseClause(finding: Finding): AnswerPart[] {
  const s5 = signal(finding, "S5")?.data;
  const released = str(s5, "released");
  const writtenFor = s5?.["written_for_php"];
  const constraint = str(s5, "php_constraint");
  const target = str(s5, "target_php");
  if (released === null || constraint === null || target === null) {
    return [text("An old promise: its PHP constraint is open-ended for the target PHP.")];
  }
  const forPhp =
    typeof writtenFor === "number" || typeof writtenFor === "string" ? ` for PHP ${String(writtenFor)}` : "";
  return [
    text(`An old promise: released in ${released.slice(0, 4)}${forPhp}, its open constraint `),
    name(constraint),
    text(` admits PHP ${target} untested.`),
  ];
}

/** Up to two ways in named, counted past that with the first still named. */
function reachClause(finding: Finding): AnswerPart[] {
  const dev = finding.dev ? ", for development only" : "";
  if (finding.direct) return [text(` You require it directly${dev}.`)];
  const ways = waysIn(finding);
  const [first, second] = ways;
  if (first === undefined) return [text(` Nothing you require directly reaches it${dev}.`)];

  if (ways.length === 1) return [text(" It comes in through "), name(first), text(`${dev}.`)];
  if (ways.length <= WAYS_NAMED && second !== undefined) {
    return [text(" It comes in through "), name(first), text(" and "), name(second), text(`${dev}.`)];
  }
  return [
    text(` It comes in through ${ways.length} of your requirements, `),
    name(first),
    text(` among them${dev}.`),
  ];
}

function replacementClause(finding: Finding, metadataReplacement: string | null): AnswerPart[] {
  const s1 = str(signal(finding, "S1")?.data, "replacement");
  const replacement = finding.replacement ?? metadataReplacement ?? s1;
  if (replacement === null) return [];
  const resolved = finding.replacement !== null;
  // Run data counts only a resolved replacement, so one named in words says so.
  return [
    text(" Its named replacement is "),
    { kind: "replacement", text: replacement, href: resolved ? safeHref(finding.replacementUrl) : null },
    text(resolved ? "." : ", in words only — not a package lockrot resolved."),
  ];
}

/** Where no fix is coming, from each `no_fix_expected` reason: on the installed branch when one is
 *  fixed only on another, and never for an advisory whose fix was not looked for. */
function noFixClause(noFix: NoFixTally, predicted: number, n: number, branch: string | null): AnswerPart[] {
  const where: AnswerPart[] =
    noFix.branch === 0 ? [] : branch === null ? [text(" on your branch")] : [text(" on "), name(branch)];
  if (predicted === 0) {
    return [text(n === 1 ? "; its fix could not be looked for." : "; their fix could not be looked for.")];
  }
  if (noFix.unread === 0) {
    return where.length === 0
      ? [text(" and no fix is coming for it.")]
      : [text(" and no fix is coming"), ...where, text(".")];
  }
  return [
    text(`; for ${predicted} of them no fix is coming`),
    ...where,
    text(`, and for ${noFix.unread} the fix could not be looked for.`),
  ];
}

/** Advisories: how many affect the installed version, then whether lockrot sees a fix to move to. */
function advisoryClause(finding: Finding): AnswerPart[] {
  const n = finding.advisories.length;
  if (n === 0) return [];
  const noFix = noFixTally(finding);
  const predicted = noFix === null ? 0 : noFix.none + noFix.branch + noFix.other;
  const parts: AnswerPart[] = [
    text(" "),
    figure(n === 1 ? "1 security advisory" : `${n} security advisories`, predicted > 0 ? "crit" : "high"),
    text(n === 1 ? " affects your version" : " affect your version"),
  ];
  if (noFix !== null) {
    parts.push(...noFixClause(noFix, predicted, n, installedBranch(finding)));
    return parts;
  }
  const fixes = new Set(finding.advisories.map((a) => a.fixedBy));
  const [only] = [...fixes];
  if (fixes.size === 1 && typeof only === "string" && only !== "") {
    parts.push(text("; "), name(only), text(n === 1 ? " fixes it." : " fixes them."));
  } else {
    parts.push(text("."));
  }
  return parts;
}

export function answerParts({
  finding,
  metadataReplacement,
  thresholds,
  details = null,
}: AnswerInput): readonly AnswerPart[] {
  return [
    ...verdictClause(finding, thresholds, details),
    ...reachClause(finding),
    ...replacementClause(finding, metadataReplacement),
    ...advisoryClause(finding),
  ];
}

/** The parts as one plain string — what a screen reader hears and what the tests compare. */
export function answerText(parts: readonly AnswerPart[]): string {
  return parts.map((part) => part.text).join("");
}

/** Three or more from one vendor sharing a verdict are counted in one entry, not listed. */
export interface PulledEntry {
  /** `vendor/*` when the entry counts a group; `null` for a single package. */
  readonly vendor: string | null;
  readonly packages: readonly string[];
  readonly verdict: string;
}

export interface PulledIn {
  /** S7's own `flagged` count, or its package list's length when the count is missing. */
  readonly flagged: number;
  readonly entries: readonly PulledEntry[];
}

/** The fewest members a vendor must share a verdict with before they are counted, not listed. */
const GROUP_AT = 3;

/** S7's own `packages`, in its order; grouping by vendor is presentation only. */
export function pulledIn(finding: Finding): PulledIn | null {
  const data = signal(finding, "S7")?.data;
  const raw = data?.["packages"];
  if (!Array.isArray(raw)) return null;

  const packages: { pkg: string; verdict: string }[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record["package"] !== "string") continue;
    packages.push({
      pkg: record["package"],
      verdict: typeof record["verdict"] === "string" ? record["verdict"] : "flagged",
    });
  }
  if (packages.length === 0) return null;

  const groups = new Map<string, { vendor: string; verdict: string; packages: string[] }>();
  for (const { pkg, verdict } of packages) {
    const vendor = pkg.includes("/") ? pkg.slice(0, pkg.indexOf("/")) : pkg;
    const key = `${vendor}\u0000${verdict}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { vendor, verdict, packages: [pkg] });
    else group.packages.push(pkg);
  }

  const entries: PulledEntry[] = [];
  for (const group of groups.values()) {
    if (group.packages.length >= GROUP_AT) {
      entries.push({ vendor: `${group.vendor}/*`, packages: group.packages, verdict: group.verdict });
    } else {
      for (const pkg of group.packages)
        entries.push({ vendor: null, packages: [pkg], verdict: group.verdict });
    }
  }

  const flagged = num(data, "flagged");
  return { flagged: flagged ?? packages.length, entries };
}

/** Worst verdict first, in S7's own order, so the count, the fold and S7 agree. */
export function pulledVerdicts(
  pulled: PulledIn,
): readonly { verdict: string; packages: readonly string[] }[] {
  const byVerdict = new Map<string, string[]>();
  for (const entry of pulled.entries) {
    byVerdict.set(entry.verdict, [...(byVerdict.get(entry.verdict) ?? []), ...entry.packages]);
  }
  return [...byVerdict]
    .map(([verdict, packages]) => ({ verdict, packages }))
    .sort((a, b) => verdictRank(a.verdict) - verdictRank(b.verdict));
}

function verdictRank(verdict: string): number {
  const index = (VERDICT_ORDER as readonly string[]).indexOf(verdict);
  return index === -1 ? VERDICT_ORDER.length : index;
}
