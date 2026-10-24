/**
 * The words of `run.php_window` (SPEC §5.9): the Overview's PHP state line (§7.9.4), the Run tab's
 * window rows (§7.9.16) and the edge setter line of the sheet (G157, §7.9.8.14). Every constraint
 * prints in full (O-5).
 */

import type { Finding, HeldBy, PhpWindowReq, PhpWindowSet, Report2, Run, TargetFix } from "../model/report";
import { NAMES_SHOWN, newestPhpWords, signalData } from "./findingWords";
import { plural, pluralNoun } from "./format";
import { joinAnd } from "./joinWords";
import { linkWords } from "./linkWords";
import { checkReasonRich } from "./pageVocabulary";
import { plain } from "./rich";
import { commandLine } from "./shellArgv";

type PhpWindow = NonNullable<Run["php_window"]>;

/** The set the run analysed: with require-dev under `--dev`, else without. */
function analysedSet(run: Run, window: PhpWindow): PhpWindowSet {
  return run.include_dev ? (window.with_dev ?? window.without_dev) : window.without_dev;
}

// shortcut: the page has no list of known minors, so only the major breaks PHP skipped are known
// here; a new major adds its pair.
const NEXT_MAJOR: Readonly<Record<string, string>> = { "5.6": "7.0", "7.4": "8.0" };

function follows(previous: string, minor: string): boolean {
  if (NEXT_MAJOR[previous] === minor) return true;
  const [pMajor, pMinor] = previous.split(".").map(Number);
  const [major, next] = minor.split(".").map(Number);
  return pMajor === major && (pMinor ?? 0) + 1 === next;
}

/** "7.4", "8.3 to 8.4", or "7.1 and 8.1 to 8.5" across a gap. */
export function minorsWords(minors: readonly string[], gaps: boolean): string {
  const runs: string[][] = [];
  for (const minor of minors) {
    const last = runs.at(-1);
    const previous = last?.at(-1);
    if (last !== undefined && previous !== undefined && (!gaps || follows(previous, minor))) last.push(minor);
    else runs.push([minor]);
  }
  return joinAnd(
    runs.map((run) => (run.length === 1 ? (run[0] ?? "") : `${run[0] ?? ""} to ${run.at(-1) ?? ""}`)),
  );
}

/** `joinAnd` up to `NAMES_SHOWN` items, then "a, b, c and {n} more". */
function joinAndCapped(items: readonly string[]): string {
  if (items.length <= NAMES_SHOWN) return joinAnd(items);
  return `${items.slice(0, NAMES_SHOWN).join(", ")} and ${items.length - NAMES_SHOWN} more`;
}

function rootSection({ link, dev }: Pick<PhpWindowReq, "link" | "dev">): string {
  if (link === "conflict") return "conflict";
  return dev ? "require-dev" : "require";
}

/** A link of a setter list: "{name} {constraint}", "{name} conflict {target} {constraint}",
 *  "{name} php-64bit {constraint}" or "require.php {constraint}"; with its version where the list
 *  names the closest minors. */
export function reqWords(req: PhpWindowReq, withVersion = false): string {
  if (req.name === null) return `${rootSection(req)}.${req.target} ${req.constraint}`;
  const name = withVersion && req.version !== null ? `${req.name} ${req.version}` : req.name;
  if (req.link === "conflict") return `${name} conflict ${req.target} ${req.constraint}`;
  return req.target === "php" ? `${name} ${req.constraint}` : `${name} ${req.target} ${req.constraint}`;
}

const reqList = (reqs: readonly PhpWindowReq[], withVersion = false): string =>
  joinAndCapped([...new Set(reqs.map((req) => reqWords(req, withVersion)))]);

function closestWords({ minors, set_by: setBy }: NonNullable<PhpWindowSet["closest"]>): string {
  return `${minorsWords(minors, true)} ${pluralNoun(minors.length, "is", "are")} excluded only by ${reqList(setBy, true)}`;
}

/** One Run tab row's cells (SPEC §7.9.16): the minors, the lowest edge and the excluded minor. */
function setCells(set: PhpWindowSet): string {
  if (set.minors.length === 0) return `none${set.closest === null ? "" : ` · ${closestWords(set.closest)}`}`;
  const lower = set.lower_edge;
  const upper = set.upper_edge;
  return [
    minorsWords(set.minors, set.gaps),
    ...(lower === null
      ? []
      : [`lowest ${lower.php}${lower.set_by.length > 0 ? `, set by ${reqList(lower.set_by)}` : ""}`]),
    ...(upper === null ? [] : [`${upper.excludes} excluded by ${reqList(upper.set_by)}`]),
  ].join(" · ");
}

/** The Run tab's PHP window rows as label and value; empty when `run.php_window` is null. */
export function windowFacts({ run }: Pick<Report2, "run">): { key: string; value: string }[] {
  const window = run.php_window;
  if (window === null) return [];
  return [
    ...(window.with_dev === null
      ? [{ key: "PHP window", value: setCells(window.without_dev) }]
      : [
          { key: "PHP window, with require-dev", value: setCells(window.with_dev) },
          { key: "PHP window, without require-dev", value: setCells(window.without_dev) },
        ]),
    ...(window.platform_override === null
      ? []
      : [{ key: "Composer checks the lock at", value: `${window.platform_override} (config.platform.php)` }]),
    ...(window.host_requires.length === 0
      ? []
      : [{ key: "Host features required", value: window.host_requires.join(", ") }]),
  ];
}

/** The rows as one string each (golden `php_rows`). */
export const windowRows = (report: Pick<Report2, "run">): string[] =>
  windowFacts(report).map(({ key, value }) => `${key}: ${value}`);

const sameMinors = (a: PhpWindowSet, b: PhpWindowSet): boolean =>
  a.minors.length === b.minors.length && a.minors.every((minor, i) => minor === b.minors[i]);

function setWords(set: PhpWindowSet): string {
  if (set.minors.length > 0) return `on PHP ${minorsWords(set.minors, set.gaps)}`;
  return `on no PHP${set.closest === null ? "" : ` (${closestWords(set.closest)})`}`;
}

function windowClause(window: PhpWindow): string {
  const { with_dev: withDev, without_dev: withoutDev } = window;
  if (withDev === null || sameMinors(withDev, withoutDev))
    return `this lock installs ${setWords(withoutDev)}`;
  return `without require-dev this lock installs ${setWords(withoutDev)}, and with require-dev ${setWords(withDev)}`;
}

const ROOT_LINKS: readonly string[] = ["require", "require-dev", "conflict"];
const PHP_TARGETS: readonly (string | null)[] = ["php", "php-64bit"];

/** §5.9's root-ceiling test: a refusal whose every hold is a root php link. */
function isRootCeiling(fix: TargetFix): boolean {
  return (
    fix.check === "refused" &&
    fix.held_by.length > 0 &&
    fix.held_by.every(
      (h) => h.source === "root" && ROOT_LINKS.includes(h.link) && PHP_TARGETS.includes(h.target),
    )
  );
}

/** A hold as the `php:` line words it (SPEC §7.0), with the link words of the move card. */
const holdWords = (h: HeldBy): string =>
  `${h.source === "root" ? "composer.json" : `${h.package ?? ""} ${h.version ?? ""}`} ${plain(linkWords(h))}`;

function packageNames(fix: TargetFix): string[] {
  const names: string[] = [];
  for (const { name, dev } of fix.packages) {
    const word = dev ? `${name} (require-dev)` : name;
    if (!names.includes(word)) names.push(word);
  }
  return names;
}

function packagesClause(fix: TargetFix, target: string): string {
  const names = packageNames(fix);
  return `${plural(names.length, "package excludes", "packages exclude")} ${target}: ${joinAndCapped(names)}`;
}

function fixClauses(fix: TargetFix, target: string): string[] {
  if (isRootCeiling(fix)) {
    const links = [...new Set(fix.held_by.map((h) => `${h.link}.${h.target ?? ""}`))];
    return [`your target, ${target}, is excluded, and only a change to ${joinAndCapped(links)} can admit it`];
  }
  const solver = `Composer's solver at PHP ${target}`;
  const command = fix.command === null ? null : commandLine(fix.command, "posix");
  switch (fix.check) {
    case "resolves":
      return [
        packagesClause(fix, target),
        fix.platform_step
          ? `set config.platform.php to your PHP ${target} release, then Composer's solver resolves this update: ${command ?? ""}`
          : `${solver} resolves this update: ${command ?? ""}`,
      ];
    case "refused": {
      const their = packageNames(fix).length === 1 ? "its" : "their";
      const holds = fix.held_by.length === 0 ? "" : `: ${fix.held_by.map(holdWords).join(" and ")}`;
      return [packagesClause(fix, target), `${solver} refuses ${their} update${holds}`];
    }
    default:
      return [
        packagesClause(fix, target),
        `not checked (${fix.reason === null ? "the run checked no move" : plain(checkReasonRich(fix.reason))})`,
      ];
  }
}

const isCapped = (f: Finding): boolean => f.flags.some((flag) => flag.id === "capped");

/** The clauses of the PHP state line (SPEC §7.9.4); null when the line does not show. */
export function phpStateClauses(report: Pick<Report2, "run" | "findings">): string[] | null {
  const { run, findings } = report;
  const window = run.php_window;
  if (window === null) return null;
  const capped = findings.filter(isCapped);
  const inside = window.target.inside;
  if (inside && window.platform_override === null && capped.length === 0) return null;
  const fix = window.target_fix;
  const target = run.target_php;
  const ceiling = fix !== null && isRootCeiling(fix);
  const head = windowClause(window) + (inside || ceiling ? "" : `, so your target, ${target}, is excluded`);
  if (fix !== null) return [head, ...fixClauses(fix, target)];
  const s11 = capped.map((f) => signalData(f, "S11")).find((data) => data !== null) ?? null;
  return [
    head,
    ...(window.platform_override === null
      ? []
      : [
          `Composer checks it at ${window.platform_override}, the PHP that the lock records from config.platform.php, not the PHP of the machine`,
        ]),
    ...(s11 === null
      ? []
      : [`${plural(capped.length, "package stops", "packages stop")} below ${newestPhpWords(s11)}`]),
  ];
}

/** G157: the edges of the analysed set that this package sets, where they are stricter than
 *  require.php (O-2). A package with the `capped` flag says it in its reading instead. */
export function edgeSetterLines(finding: Finding, run: Run): string[] {
  const window = run.php_window;
  if (window === null || isCapped(finding)) return [];
  const set = analysedSet(run, window);
  const names = (reqs: readonly PhpWindowReq[]): boolean => reqs.some((req) => req.name === finding.package);
  const lower = set.lower_edge;
  const upper = set.upper_edge;
  const floor = run.project_php_lowest;
  return [
    ...(lower !== null && names(lower.set_by) && (floor === null || isAbove(lower.php, floor))
      ? [`It sets the lowest PHP this lock admits: ${lower.php}`]
      : []),
    ...(upper !== null && names(upper.set_by) && upper.set_by.every((req) => req.name !== null)
      ? [`It sets the highest PHP this lock admits: it excludes ${upper.excludes}`]
      : []),
  ];
}

function isAbove(version: string, than: string): boolean {
  const a = version.split(".").map(Number);
  const b = than.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}
