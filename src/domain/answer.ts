/**
 * The open package's answer sentence (PD-DETAIL-6, DESIGN.md §5): what it is, why it matters and
 * how it gets in, composed only from the finding's own fields — its verdict, the signals that set
 * it, its chain, its advisories and a replacement lockrot or Packagist named. Pure and DOM-free, like
 * `domain/timeline.ts`: it returns typed parts, and `detail/DetailLead.tsx` only decides how each
 * kind of part looks (a name in mono, a figure in bold and, for an age, its zone's tone).
 *
 * Every clause restates a fact the document already carries; none of it is a new judgement. Where
 * a signal a clause would quote is missing, the clause falls back to fewer words, never a guess.
 */

import type { Finding, Signal } from "../model/types";
import {
  ageSource,
  ageZone,
  pushThresholds,
  releaseThresholds,
  type AgeLegend,
  type Thresholds,
} from "./age";
import { WAYS_NAMED, waysIn } from "./reach";
import { hasNoFixExpected } from "./sniff";
import type { Tone } from "./vocab";

export type AnswerPart =
  | { readonly kind: "text"; readonly text: string }
  /** A package, branch, version or constraint — set in mono. */
  | { readonly kind: "name"; readonly text: string }
  /** A figure the sentence turns on. `tone` is an age's zone against the run's thresholds, or the
   *  advisory count's own weight; `null` leaves it in ink. */
  | { readonly kind: "figure"; readonly text: string; readonly tone: Tone | null }
  /** The replacement's name. `linked` when it is a Composer package lockrot resolved
   *  (`finding.replacement`), so the page can link it to Packagist; Packagist's own free text is not. */
  | { readonly kind: "replacement"; readonly text: string; readonly linked: boolean };

export interface AnswerInput {
  readonly finding: Finding;
  /** Packagist's own free-text replacement (`metadata.replacement`), when the explain data has one. */
  readonly metadataReplacement: string | null;
  readonly thresholds: Thresholds;
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

/** "3.6 years", "1 month", "7 months" — a signal's own `years`, as the list's rows round it. */
export function yearsPhrase(years: number): string {
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return months === 1 ? "1 month" : `${months} months`;
  }
  return `${years.toFixed(1)} years`;
}

/** An age figure in its zone's tone, or in ink when the verdict does not rest on age
 *  (`contextOnly`) or the run never recorded the pair it is measured against. */
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
function verdictClause(finding: Finding, thresholds: Thresholds): AnswerPart[] {
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
    case "pinned": {
      const snapshot = str(signal(finding, "S6")?.data, "version") ?? finding.version;
      return [text("Pinned to "), name(snapshot), text(", a branch snapshot rather than a release.")];
    }
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
    case "finished":
      return [text("On the allowlist as finished, so it is not flagged.")];
    case "ok":
      return [text("Nothing flagged it.")];
    case "unknown":
      return [text("Not checked: lockrot could not read any data for it.")];
    default:
      return [text(`${finding.verdict.charAt(0).toUpperCase()}${finding.verdict.slice(1)}.`)];
  }
}

/** Abandoned: S1 (the repository's own flag) and S3 (archived), then how long it has been quiet —
 *  the one age the key facts beside it quote (`age.ts#ageSource`, S8 > S2 > S4), so the sentence and
 *  the facts never name two different ages; in ink, since an abandoned package's priority never
 *  rests on its age (`age.ts#isContextOnly`). */
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

/** How it gets in: required directly, or through every requirement of yours that reaches it
 *  (`reach.ts#waysIn`, the same list the ladder's reach rung and the chain name) — both named up to
 *  two, counted past that with the first still named. */
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
  return [
    text(" Its named replacement is "),
    { kind: "replacement", text: replacement, linked: finding.replacement !== null },
    text("."),
  ];
}

/** Advisories: how many affect the installed version, then whether lockrot sees a fix to move to. */
function advisoryClause(finding: Finding): AnswerPart[] {
  const n = finding.advisories.length;
  if (n === 0) return [];
  const noFix = hasNoFixExpected(finding);
  const parts: AnswerPart[] = [
    text(" "),
    figure(n === 1 ? "1 security advisory" : `${n} security advisories`, noFix ? "crit" : "high"),
    text(n === 1 ? " affects your version" : " affect your version"),
  ];
  if (noFix) {
    const branch = str(signal(finding, "S8")?.data, "branch");
    if (branch !== null) parts.push(text(" and no fix is coming on "), name(branch), text("."));
    else parts.push(text(" and no fix is coming for it."));
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

/**
 * The whole answer, as parts in reading order: the verdict clause, then how it gets in, then the
 * named replacement and the advisories when there are any. Adjacent plain text is left unmerged;
 * the renderer draws each part as it comes.
 */
export function answerParts({
  finding,
  metadataReplacement,
  thresholds,
}: AnswerInput): readonly AnswerPart[] {
  return [
    ...verdictClause(finding, thresholds),
    ...reachClause(finding),
    ...replacementClause(finding, metadataReplacement),
    ...advisoryClause(finding),
  ];
}

/** The parts as one plain string — what a screen reader hears and what the tests compare. */
export function answerText(parts: readonly AnswerPart[]): string {
  return parts.map((part) => part.text).join("");
}

/** One entry of "What it pulls in": a single flagged package, or three or more from one vendor that
 *  share a verdict, counted in one entry ("14 hoa/* packages, abandoned") rather than listed. */
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

/**
 * What the package pulls in that is itself flagged, from S7's own `packages` list, in its own order
 * (S7 lists them; this only counts). Grouping by the string before the slash is presentation: it
 * never decides anything, and every package it counts stays one click away in S7's own detail.
 * `null` when the finding has no S7 or S7 names no package.
 */
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

/** What it pulls in, by verdict, most first (ties keep S7's own order), each verdict with its own
 *  packages in S7's order — the sentence "What it pulls in" says once there are too many entries to
 *  name, and the list its "Name all" fold opens, so the count and the names always agree. */
export function pulledVerdicts(
  pulled: PulledIn,
): readonly { verdict: string; packages: readonly string[] }[] {
  const byVerdict = new Map<string, string[]>();
  for (const entry of pulled.entries) {
    byVerdict.set(entry.verdict, [...(byVerdict.get(entry.verdict) ?? []), ...entry.packages]);
  }
  return [...byVerdict]
    .map(([verdict, packages]) => ({ verdict, packages }))
    .sort((a, b) => b.packages.length - a.packages.length);
}
