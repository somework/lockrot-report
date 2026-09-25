/**
 * What a printed or copied report says about itself (ui/print/, Header's "Copy summary"): the
 * flagged packages split by where they are installed and how they get in, the three-line plain-text
 * summary, and the running line a printed page repeats. Display only: every figure is a count of a
 * field the document already carries (`Finding.dev`, `Finding.direct`, the priority counts), or a
 * value it states as is — no verdict, no threshold and no advice of its own.
 */

import type { Finding, LibyearsBlock, View } from "../model/types";
import { fixed, plural } from "./format";
import { RANKED_PRIORITIES, sharePhrase } from "./summary";

/** The flagged packages counted twice over: by install scope (`Finding.dev`) and by reach
 *  (`Finding.direct`). The two splits each add up to `total`; they are independent of each other. */
export interface ScopeRollup {
  readonly total: number;
  /** Not dev-only: in the lock's `packages`, so a `--no-dev` install still brings it. */
  readonly production: number;
  readonly dev: number;
  readonly direct: number;
  readonly transitive: number;
}

export function scopeRollup(flagged: readonly Pick<Finding, "dev" | "direct">[]): ScopeRollup {
  const dev = flagged.filter((f) => f.dev).length;
  const direct = flagged.filter((f) => f.direct).length;

  return {
    total: flagged.length,
    production: flagged.length - dev,
    dev,
    direct,
    transitive: flagged.length - direct,
  };
}

/** One half of a split: "51 in production, 18 dev-only", or "all 69 in production" when the other
 *  side is empty. A single package reads "in production", not "all 1 in production". */
function split(total: number, a: number, aWord: string, bWord: string): string {
  const b = total - a;
  if (total === 1) return a === 1 ? aWord : bWord;
  if (b === 0) return `all ${String(total)} ${aWord}`;
  if (a === 0) return `all ${String(total)} ${bWord}`;
  return `${String(a)} ${aWord}, ${String(b)} ${bWord}`;
}

/**
 * The rollup as the two clauses the summary band and the copied summary both print: install scope
 * first (what a production deploy carries), then reach. Empty for no flagged package — the band
 * already says "Nothing flagged", and a line of zeros under it would say nothing.
 */
export function rollupClauses(rollup: ScopeRollup): readonly string[] {
  if (rollup.total === 0) return [];
  return [
    split(rollup.total, rollup.production, "in production", "dev-only"),
    split(rollup.total, rollup.direct, "required directly", "pulled in"),
  ];
}

/** The facts the copied summary is built from, all read off the model by the caller. */
export interface SummaryFacts {
  readonly project: string;
  readonly generatedDay: string;
  readonly toolVersion: string | null;
  readonly targetPhp: string | null;
  /** Packages the run checked: `packagesChecked`, else the findings' count. */
  readonly checked: number;
  readonly flagged: readonly Pick<Finding, "dev" | "direct" | "priority">[];
  readonly advisories: number;
  readonly advisoryPackages: number;
  readonly advisoryCheckIncomplete: boolean;
  readonly libyears: LibyearsBlock | null;
}

function priorityCounts(flagged: readonly Pick<Finding, "priority">[]): string {
  const counts = new Map<string, number>();
  for (const f of flagged) counts.set(f.priority, (counts.get(f.priority) ?? 0) + 1);
  const known: readonly string[] = RANKED_PRIORITIES;
  const order = [...known, ...[...counts.keys()].filter((p) => !known.includes(p))];
  return order
    .filter((p) => (counts.get(p) ?? 0) > 0)
    .map((p) => `${String(counts.get(p) ?? 0)} ${p}`)
    .join(", ");
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Three lines of plain text a reader pastes into a chat or a ticket: what was checked and when, the
 * headline count by priority, then where the flagged packages sit, the advisories and libyears.
 * Same words as the summary band; nothing the band does not show.
 */
export function summaryText(facts: SummaryFacts): string {
  const head = [
    `lockrot report for ${facts.project}`,
    `data as of ${facts.generatedDay}`,
    ...(facts.toolVersion !== null ? [`lockrot ${facts.toolVersion}`] : []),
    ...(facts.targetPhp !== null ? [`target PHP ${facts.targetPhp}`] : []),
  ].join(" · ");

  const n = facts.flagged.length;
  const count =
    facts.checked === 0
      ? "No packages in this lock."
      : n === 0
        ? `Nothing flagged in ${plural(facts.checked, "package", "packages")}.`
        : `${String(n)} of ${plural(facts.checked, "package", "packages")} flagged (${sharePhrase(n, facts.checked)}): ${priorityCounts(facts.flagged)}.`;

  const clauses = rollupClauses(scopeRollup(facts.flagged));
  const advisories =
    facts.advisories > 0
      ? `${plural(facts.advisories, "security advisory", "security advisories")} on ${plural(facts.advisoryPackages, "package", "packages")}`
      : facts.advisoryCheckIncomplete
        ? "no advisory found, but the advisory check was incomplete"
        : "no security advisory";
  const ly = facts.libyears && facts.libyears.measured ? fixed(facts.libyears.total, 1) : null;
  const tail = [
    ...(clauses.length > 0 ? [clauses.join("; ")] : []),
    advisories,
    ...(ly !== null ? [`${ly} libyears behind`] : []),
  ];

  return [head, count, `${capitalise(tail.join(" · "))}.`].join("\n");
}

/** The line every printed page repeats at its top: the project, the data date, the lockrot. */
export function runningLine(project: string, generatedDay: string, toolVersion: string | null): string {
  return [
    project,
    `data as of ${generatedDay}`,
    ...(toolVersion !== null ? [`lockrot ${toolVersion}`] : []),
  ].join("  ·  ");
}

/**
 * `text` as a CSS string literal, for a custom property a `@page` margin box's `content` reads
 * (print.css): quotes and backslashes escaped, and any control character — a newline in a project
 * name — written as a CSS hex escape, so the value can never close the string or the declaration.
 */
export function cssString(text: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is escaped
  const escaped = text.replace(/["\\\u0000-\u001f\u007f]/g, (ch) =>
    ch === '"' || ch === "\\" ? `\\${ch}` : `\\${ch.charCodeAt(0).toString(16)} `,
  );
  return `"${escaped}"`;
}

/** The sections a printed report carries, in order. All packages only when the reader printed
 *  from that tab: 271 rows is a lot of paper to spend unasked. */
export type PrintSection = "summary" | "findings" | "advisories" | "radius" | "run" | "packages";

export function printSections(view: View): readonly PrintSection[] {
  const base: readonly PrintSection[] = ["summary", "findings", "advisories", "radius", "run"];
  return view === "packages" ? [...base, "packages"] : base;
}
