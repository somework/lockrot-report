/**
 * Release branches against the run's two PHP floors, in words: `run.project_php` and
 * `run.target_php` quoted as written, each branch row's `admits_*`, `misses_*` and `php_blocked_by`
 * read as lockrot wrote them. Nothing here reads a constraint or picks a branch; S8 names the one a
 * reader can move to.
 */

import type { BranchRow, RunSettings, Signal } from "../model/types";

export type FloorPart =
  | { readonly kind: "text"; readonly text: string }
  /** A branch or a version. */
  | { readonly kind: "name"; readonly text: string }
  /** A constraint, a key or a value as written: mono, never broken. */
  | { readonly kind: "code"; readonly text: string };

export type FloorKey = "project" | "target";

export interface Floors {
  /** `run.project_php` as written. */
  readonly project: string | null;
  readonly target: string | null;
  /** `run.project_php` written as null: the project names no PHP floor. Absent is silence. */
  readonly noProjectFloor: boolean;
}

export function readFloors(run: RunSettings, absent: readonly string[]): Floors {
  return {
    project: run.projectPhp,
    target: run.targetPhp,
    noProjectFloor: run.projectPhp === null && !absent.includes("run.project_php"),
  };
}

/** Project first, then target, the order every sentence names them in. */
function named(floors: Floors): readonly FloorKey[] {
  return [
    ...(floors.project !== null ? (["project"] as const) : []),
    ...(floors.target !== null ? (["target"] as const) : []),
  ];
}

export interface Miss {
  readonly floor: FloorKey;
  /** `misses_<floor>_php` as written; null says only that the row does not admit it. */
  readonly code: string | null;
}

export type Standing =
  /** `blockedBy`: a `php_blocked_by` value this page does not know, as written. */
  | { readonly kind: "admits"; readonly blockedBy: string | null }
  | { readonly kind: "misses"; readonly misses: readonly Miss[]; readonly blockedBy: string | null }
  /** An `admits_*` of a named floor is null: no answer, never admitted or not. */
  | { readonly kind: "unanswered" }
  | { readonly kind: "unrecorded" };

/** Null for a row that carries none of the fields, or a run that names no floor. */
export function standing(row: BranchRow, floors: Floors): Standing | null {
  const keys = named(floors);
  if (!row.floorFields || keys.length === 0) return null;
  if (row.php === null) return { kind: "unrecorded" };
  const blocked = row.phpBlockedBy;
  const blockedBy = blocked !== null && blocked !== "project" && blocked !== "target" ? blocked : null;
  const misses: Miss[] = [];
  let unanswered = false;
  for (const key of keys) {
    const admits = key === "project" ? row.admitsProjectPhp : row.admitsTargetPhp;
    if (admits === false) {
      misses.push({ floor: key, code: key === "project" ? row.missesProjectPhp : row.missesTargetPhp });
    } else if (admits === null) {
      unanswered = true;
    }
  }
  if (misses.length > 0) return { kind: "misses", misses, blockedBy };
  if (unanswered) return { kind: "unanswered" };
  return { kind: "admits", blockedBy };
}

const text = (value: string): FloorPart => ({ kind: "text", text: value });
const name = (value: string): FloorPart => ({ kind: "name", text: value });
const code = (value: string): FloorPart => ({ kind: "code", text: value });

/** "sentence": under a line that names the floors, so one floor is "it" and two "both".
 *  "cell": on its own, in a table cell, so a single floor is named. */
export type Voice = "sentence" | "cell";

function verb(singular: string, plural: string, many: boolean): string {
  return many ? plural : singular;
}

/** How a clause names a floor; null is one the reader already has in mind, said as "it". */
type Ref = FloorPart[] | null;

function ref(key: FloorKey, floors: Floors, voice: Voice, after: "than" | "plain"): Ref {
  if (voice === "sentence" && named(floors).length === 1) return null;
  if (key === "project") return [text("your "), code("require.php")];
  const target = floors.target ?? "";
  return [text(after === "than" ? target : `PHP ${target}`)];
}

function refText(r: Ref): string {
  return r === null ? "it" : plain(r);
}

const KNOWN = new Set(["needs_newer", "stops_before", "skips", "unsatisfiable"]);

function unknownWay(st: Standing): boolean {
  return st.kind === "misses" && st.misses.some((m) => m.code !== null && !KNOWN.has(m.code));
}

/** One floor's miss, or a pair missed the same way (`both`). */
function missWords(missCode: string | null, floor: Ref, many: boolean): FloorPart[] {
  const it = floor ?? [text("it")];
  switch (missCode) {
    case "needs_newer":
      return floor === null
        ? [text(`${verb("needs", "need", many)} a newer PHP`)]
        : [text(`${verb("needs", "need", many)} a newer PHP than `), ...floor];
    case "stops_before":
      return [text(`${verb("stops", "stop", many)} before `), ...it];
    case "skips":
      return [text(`${verb("skips", "skip", many)} `), ...it];
    case "unsatisfiable":
      return [text(`${verb("admits", "admit", many)} no PHP version`)];
    default: {
      const words = [text(`${verb("does", "do", many)} not admit `), ...it];
      return missCode === null ? words : [...words, text(" (lockrot: "), code(missCode), text(")")];
    }
  }
}

function both(voice: Voice, floors: Floors): Ref {
  return voice === "cell" && named(floors).length === 1
    ? ref(named(floors)[0] ?? "target", floors, voice, "plain")
    : [text("both")];
}

function blockedWords(by: string, many: boolean): FloorPart[] {
  return [text(`${verb("is", "are", many)} blocked by `), code(by)];
}

/** What a row, or `many` rows alike, do against the floors: "stops before both", "admit both". */
export function standingWords(st: Standing, floors: Floors, voice: Voice, many: boolean): FloorPart[] {
  const pair = named(floors).length === 2;
  switch (st.kind) {
    case "unrecorded":
      return [text(`${verb("records", "record", many)} no PHP requirement`)];
    case "unanswered":
      return [text(`${verb("has", "have", many)} no answer from lockrot`)];
    case "admits": {
      const words = [
        text(`${verb("admits", "admit", many)} `),
        ...(pair
          ? [text("both")]
          : (ref(named(floors)[0] ?? "target", floors, voice, "plain") ?? [text("it")])),
      ];
      return st.blockedBy === null ? words : [...words, text(" but "), ...blockedWords(st.blockedBy, many)];
    }
    case "misses": {
      const [first, second] = st.misses;
      let words: FloorPart[];
      if (first !== undefined && second !== undefined && first.code === second.code) {
        words =
          first.code === null
            ? [text(`${verb("admits", "admit", many)} neither`)]
            : KNOWN.has(first.code)
              ? missWords(first.code, both(voice, floors), many)
              : [text(`${verb("admits", "admit", many)} neither (lockrot: `), code(first.code), text(")")];
      } else {
        words = st.misses.flatMap((miss, i) => [
          ...(i > 0 ? [text(" and ")] : []),
          ...missWords(
            miss.code,
            ref(miss.floor, floors, voice, miss.code === "needs_newer" ? "than" : "plain"),
            many,
          ),
        ]);
      }
      return st.blockedBy === null ? words : [...words, text(" and "), ...blockedWords(st.blockedBy, many)];
    }
  }
}

function key(parts: readonly FloorPart[]): string {
  return parts.map((p) => `${p.kind}:${p.text}`).join("|");
}

interface Placed {
  readonly row: BranchRow;
  readonly index: number;
  readonly st: Standing;
}

function place(rows: readonly BranchRow[], floors: Floors): Placed[] {
  return rows.flatMap((row, index) => {
    const st = standing(row, floors);
    return st === null ? [] : [{ row, index, st }];
  });
}

/** Alike rows, keyed by their words, in the order they first appear. */
function groupBy(placed: readonly Placed[], floors: Floors, voice: Voice): Placed[][] {
  const groups = new Map<string, Placed[]>();
  for (const p of placed) {
    const k = key(standingWords(p.st, floors, voice, false));
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.values()];
}

function joinAnd(items: readonly FloorPart[][]): FloorPart[] {
  return items.flatMap((item, i) => [
    ...(i === 0 ? [] : [text(i === items.length - 1 ? " and " : ", ")]),
    ...item,
  ]);
}

/** Named up to this many; a larger group is counted. */
const NAMED_MAX = 3;

/** More kinds of miss than this among the newer branches are counted in one clause. */
const MISS_KINDS_MAX = 2;

function differ(st: Standing): boolean {
  return st.kind === "misses" && st.misses.length === 2 && st.misses[0]?.code !== st.misses[1]?.code;
}

/** "7.x, 6.x and yours", or "4 newer branches and yours"; `counted` says a count came before, so
 *  this one needs no noun. */
function who(
  group: readonly Placed[],
  hasMine: boolean,
  mineIsNewest: boolean,
  counted: boolean,
): FloorPart[] {
  const mine = group.find((p) => p.row.installed);
  const others = group.filter((p) => p !== mine);
  const noun = counted ? "" : ` ${hasMine ? "newer " : ""}branches`;
  const named: FloorPart[][] =
    others.length > NAMED_MAX
      ? [[text(`${String(others.length)}${noun}`)]]
      : others.map((p) => [name(p.row.branch)]);
  if (mine === undefined) return joinAnd(named);
  if (others.length > 0) return joinAnd([[text("yours")], ...named]);
  if (mine.st.kind === "misses" && mine.row.newestDated !== null) {
    return [text("yours, in "), name(mine.row.newestDated), text(",")];
  }
  return [text(mineIsNewest ? "yours, the newest," : "yours")];
}

function capitalise(parts: readonly FloorPart[]): FloorPart[] {
  const [first, ...rest] = parts;
  if (first?.kind !== "text") return [...parts];
  return [text(first.text.charAt(0).toUpperCase() + first.text.slice(1)), ...rest];
}

/**
 * Level 0: the branches from yours up (every branch when none is yours) against the floors, alike
 * ones in one clause. Older branches are left to level 1 and the fold rows. Two floors are named
 * once up front; one is named in the first clause and is "it" after.
 */
export function floorsSentence(rows: readonly BranchRow[], floors: Floors): FloorPart[] | null {
  const all = place(rows, floors);
  if (all.length === 0) return null;
  const mineAt = rows.findIndex((row) => row.installed);
  const hasMine = mineAt >= 0 && all.some((p) => p.index === mineAt);
  const considered = hasMine ? all.filter((p) => p.index <= mineAt) : all;
  const grouped = groupBy(considered, floors, "sentence");
  // Leading with the admitting group names the floors in its own words, but only when it opens on
  // "Yours": a sentence opening on a mono branch name runs into the constraint that ends the one before.
  const admitting = grouped.find((g) => g[0]?.st.kind === "admits" && g.some((p) => p.row.installed));
  const scene: Scene = {
    groups: admitting === undefined ? grouped : [admitting, ...grouped.filter((g) => g !== admitting)],
    admitting,
    considered,
    floors,
    hasMine,
    mineIsNewest: mineAt === 0,
  };
  let headed = named(floors).length === 2 && admitting === undefined;
  let body = clauses(scene, headed);
  if (!headed && body[0]?.kind === "name") {
    headed = true;
    body = clauses(scene, headed);
  }
  const prefix = floors.noProjectFloor ? [text("The project names no PHP floor. ")] : [];
  const head = headed ? [text("Against "), ...floorsInFull(floors), text(": ")] : [];
  return [...prefix, ...(headed ? [...head, ...body] : capitalise(body)), text(".")];
}

interface Scene {
  readonly groups: readonly Placed[][];
  readonly admitting: Placed[] | undefined;
  readonly considered: readonly Placed[];
  readonly floors: Floors;
  readonly hasMine: boolean;
  readonly mineIsNewest: boolean;
}

/** `headed`: the floors are named before the first clause, so every clause may say "both"/"it". */
function clauses(scene: Scene, headed: boolean): FloorPart[] {
  const { groups, admitting, considered, floors, hasMine } = scene;
  const newerMisses = groups.filter((g) => g[0]?.st.kind === "misses" && !g.some((p) => p.row.installed));
  const out: FloorPart[][] = [];
  let summarised = false;
  let counted = false;
  for (const group of groups) {
    const lead = group[0];
    if (lead === undefined) continue;
    const voice: Voice = headed || out.length > 0 ? "sentence" : "cell";
    if (newerMisses.length > MISS_KINDS_MAX && newerMisses.includes(group)) {
      if (!summarised) out.push(missSummary(considered, newerMisses.flat(), floors, hasMine, voice));
      summarised = true;
      continue;
    }
    const words =
      group === admitting && !headed && out.length === 0
        ? admitsInFull(lead.st, floors, group.length > 1)
        : standingWords(lead.st, floors, voice, group.length > 1);
    out.push([...who(group, hasMine, scene.mineIsNewest, counted), text(" "), ...words]);
    counted ||= group.filter((p) => !p.row.installed).length > NAMED_MAX;
  }
  return out.flatMap((c, i) => [...(i > 0 ? [text("; ")] : []), ...c]);
}

function floorsInFull(floors: Floors): FloorPart[] {
  return joinAnd(
    named(floors).map((k) =>
      k === "project"
        ? [text("your "), code(`require.php (${floors.project ?? ""})`)]
        : [text(`PHP ${floors.target ?? ""}`)],
    ),
  );
}

/** The first clause names what "both" and "it" stand for after it. */
function admitsInFull(st: Standing, floors: Floors, many: boolean): FloorPart[] {
  const words = [text(`${verb("admits", "admit", many)} `), ...floorsInFull(floors)];
  return st.kind === "admits" && st.blockedBy !== null
    ? [...words, text(" but "), ...blockedWords(st.blockedBy, many)]
    : words;
}

/** "none of the 5 newer branches admits both, 6.x missing the two in different ways". */
function missSummary(
  considered: readonly Placed[],
  missing: readonly Placed[],
  floors: Floors,
  hasMine: boolean,
  voice: Voice,
): FloorPart[] {
  const newer = considered.filter((p) => !p.row.installed).length;
  const keys = named(floors);
  const what = keys.length === 2 ? "both" : refText(ref(keys[0] ?? "target", floors, voice, "plain"));
  const noun = hasMine ? "newer branches" : "branches";
  const head =
    missing.length === newer
      ? [text(`none of the ${String(newer)} ${noun} admits ${what}`)]
      : [text(`${String(missing.length)} of the ${String(newer)} ${noun} do not admit ${what}`)];
  const odd = missing.filter((p) => differ(p.st));
  if (odd.length === 0) return head;
  return [
    ...head,
    text(", "),
    ...joinAnd(odd.map((p) => [name(p.row.branch)])),
    text(" missing the two in different ways"),
  ];
}

export type FloorItem =
  | { readonly kind: "one"; readonly branch: string; readonly yours: boolean }
  | { readonly kind: "run"; readonly from: string; readonly to: string; readonly count: number };

export interface FloorGroup {
  readonly items: readonly FloorItem[];
  readonly words: readonly FloorPart[];
}

/** Contiguous rows past this many read as one run, "0.7.x – 0.1.x (7)". */
const RUN_MIN = 3;

function runsOf(group: readonly Placed[]): FloorItem[] {
  const items: FloorItem[] = [];
  let run: Placed[] = [];
  const flush = (): void => {
    const first = run[0];
    const last = run[run.length - 1];
    if (first !== undefined && last !== undefined && run.length >= RUN_MIN) {
      items.push({ kind: "run", from: first.row.branch, to: last.row.branch, count: run.length });
    } else {
      items.push(...run.map((p) => ({ kind: "one" as const, branch: p.row.branch, yours: false })));
    }
    run = [];
  };
  for (const p of group) {
    if (p.row.installed) {
      flush();
      items.push({ kind: "one", branch: p.row.branch, yours: true });
      continue;
    }
    const prev = run[run.length - 1];
    if (prev !== undefined && p.index !== prev.index + 1) flush();
    run.push(p);
  }
  flush();
  return items;
}

/** Level 1: every branch, one line per kind of standing, no branch left unnamed. */
export function floorsList(rows: readonly BranchRow[], floors: Floors): readonly FloorGroup[] {
  return groupBy(place(rows, floors), floors, "cell").flatMap((group) => {
    const lead = group[0];
    if (lead === undefined) return [];
    return [{ items: runsOf(group), words: standingWords(lead.st, floors, "cell", group.length > 1) }];
  });
}

/** What a fold row hides, in its range cell: "2 stop before both", or null when none misses. */
export function foldWords(rows: readonly BranchRow[], floors: Floors): string | null {
  const missing = place(rows, floors).filter((p) => p.st.kind === "misses");
  const [first] = missing;
  if (first === undefined) return null;
  const n = String(missing.length);
  const many = missing.length > 1;
  const alike = missing.every(
    (p) =>
      key(standingWords(p.st, floors, "cell", false)) === key(standingWords(first.st, floors, "cell", false)),
  );
  if (alike && !unknownWay(first.st)) return `${n} ${plain(standingWords(first.st, floors, "cell", many))}`;
  const keys = named(floors);
  const what = keys.length === 2 ? "both" : refText(ref(keys[0] ?? "target", floors, "cell", "plain"));
  return `${n} ${verb("does", "do", many)} not admit ${what}`;
}

export function plain(parts: readonly FloorPart[]): string {
  return parts.map((part) => part.text).join("");
}

/** The level-1 definitions, once: what `php` is, what "admits" claims, which PHP the project's is. */
export function floorsDefinition(floors: Floors): FloorPart[] {
  return [
    text(
      "Each branch’s php is the requirement of its newest dated release. It admits a PHP version when that constraint allows it; lockrot does not test it.",
    ),
    ...(floors.project !== null
      ? [
          text(" Your "),
          code(`require.php (${floors.project})`),
          text(" counts from the lowest PHP it allows."),
        ]
      : []),
  ];
}

function str(data: Signal["data"] | undefined, field: string): string | null {
  const value = data?.[field];
  return typeof value === "string" && value !== "" ? value : null;
}

/** S8's floor as a reader knows it: `require.php`, the target PHP, or an unknown one as written. */
function s8Floor(source: string, floorPhp: string | null): FloorPart[] {
  if (source === "project") return [text("your "), code("require.php")];
  if (source === "target") return [text(floorPhp === null ? "the target PHP" : `PHP ${floorPhp}`)];
  return floorPhp === null ? [code(source)] : [code(floorPhp), text(" ("), code(source), text(")")];
}

/** The newest branch against S8's floor, already named: "needs a newer PHP", "stops before it". */
function newestMisses(newest: BranchRow | undefined, source: string): FloorPart[] {
  const missCode =
    newest === undefined
      ? null
      : source === "project"
        ? newest.missesProjectPhp
        : source === "target"
          ? newest.missesTargetPhp
          : null;
  return missWords(missCode, null, false);
}

/**
 * S8's answer when the newest branch is out of reach, after "its last release was 4.5 years ago":
 * "; 7.x fits your require.php, 8.x needs a newer PHP", or "; no newer branch fits your
 * require.php". Null keeps the older sentence: the newest within reach, or a document that does
 * not say.
 */
export function moveClause(
  data: Signal["data"] | undefined,
  branches: readonly BranchRow[],
): FloorPart[] | null {
  if (data?.["newest_within_reach"] !== false) return null;
  const newest = str(data, "newest_branch");
  const source = str(data, "floor_source");
  if (newest === null || source === null) return null;
  const floor = s8Floor(source, str(data, "floor_php"));
  const reachable = str(data, "reachable_branch");
  if (reachable === null) return [text("; no newer branch fits "), ...floor];
  const why = newestMisses(
    branches.find((row) => row.branch === newest),
    source,
  );
  return [text("; "), name(reachable), text(" fits "), ...floor, text(", "), name(newest), text(" "), ...why];
}
