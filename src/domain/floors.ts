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
  | { readonly kind: "code"; readonly text: string }
  /** Words that never break apart, "PHP 8.4". */
  | { readonly kind: "phrase"; readonly text: string };

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
  | {
      readonly kind: "misses";
      readonly misses: readonly Miss[];
      /** Floors whose `admits_*` is null beside the miss: no answer, never admitted. */
      readonly unanswered: readonly FloorKey[];
      readonly blockedBy: string | null;
    }
  /** Every `admits_*` not false, and one of them null. */
  | { readonly kind: "unanswered"; readonly floors: readonly FloorKey[] }
  | { readonly kind: "unrecorded" };

/** Null for a row that carries none of the fields, or a run that names no floor. */
export function standing(row: BranchRow, floors: Floors): Standing | null {
  const keys = named(floors);
  if (!row.floorFields || keys.length === 0) return null;
  if (row.php === null) return { kind: "unrecorded" };
  const blocked = row.phpBlockedBy;
  const blockedBy = blocked !== null && blocked !== "project" && blocked !== "target" ? blocked : null;
  const admitsOf = (key: FloorKey): boolean | null =>
    key === "project" ? row.admitsProjectPhp : row.admitsTargetPhp;
  const misses = keys
    .filter((key) => admitsOf(key) === false)
    .map((key) => ({ floor: key, code: key === "project" ? row.missesProjectPhp : row.missesTargetPhp }));
  const unanswered = keys.filter((key) => admitsOf(key) === null);
  if (misses.length > 0) return { kind: "misses", misses, unanswered, blockedBy };
  if (unanswered.length > 0) return { kind: "unanswered", floors: unanswered };
  return { kind: "admits", blockedBy };
}

const text = (value: string): FloorPart => ({ kind: "text", text: value });
const name = (value: string): FloorPart => ({ kind: "name", text: value });
const code = (value: string): FloorPart => ({ kind: "code", text: value });
const phrase = (value: string): FloorPart => ({ kind: "phrase", text: value });

function verb(singular: string, plural: string, many: boolean): string {
  return many ? plural : singular;
}

const KNOWN = new Set(["needs_newer", "stops_before", "skips", "unsatisfiable"]);

const asWritten = (value: string): FloorPart[] => [text(" (lockrot: "), code(value), text(")")];

/**
 * How a clause names the floors. The sentence quotes `require.php`'s constraint the first time and
 * says "both" or "it" once the reader has them; a list line or a fold cell sits under that sentence
 * and names them short.
 */
interface Namer {
  readonly two: boolean;
  /** `than`: after "a newer PHP than", where the target reads "8.4", not "PHP 8.4". */
  one(key: FloorKey, than: boolean): FloorPart[];
  pair(): FloorPart[];
  /** Both floors are already named, so "both", "neither" and "only" have something to lean on. */
  pairSaid(): boolean;
}

function shortName(key: FloorKey, floors: Floors, than: boolean): FloorPart[] {
  if (key === "project") return [text("your "), code("require.php")];
  const target = floors.target ?? "";
  return [than ? text(target) : phrase(`PHP ${target}`)];
}

function fullName(key: FloorKey, floors: Floors): FloorPart[] {
  return key === "project"
    ? [text("your "), code(`require.php (${floors.project ?? ""})`)]
    : [phrase(`PHP ${floors.target ?? ""}`)];
}

function cellNamer(floors: Floors): Namer {
  const two = named(floors).length === 2;
  return {
    two,
    one: (key, than) => shortName(key, floors, than),
    pair: () => [text("both")],
    pairSaid: () => true,
  };
}

function sentenceNamer(floors: Floors, headed: boolean): Namer {
  const keys = named(floors);
  const said = new Set<FloorKey>(headed ? keys : []);
  const two = keys.length === 2;
  const one = (key: FloorKey, than: boolean): FloorPart[] => {
    const known = said.has(key);
    said.add(key);
    if (!known) return key === "target" && than ? [text(floors.target ?? "")] : fullName(key, floors);
    return !two && !than ? [text("it")] : shortName(key, floors, than);
  };
  return {
    two,
    one,
    pair: () => {
      if (keys.every((key) => said.has(key))) return [text("both")];
      return joinAnd(keys.map((key) => one(key, false)));
    },
    pairSaid: () => keys.every((key) => said.has(key)),
  };
}

type Ref = (than: boolean) => FloorPart[];

/** One way of missing, against a floor or a pair: "needs a newer PHP than 8.4", "stop before both". */
function wayWords(missCode: string | null, ref: Ref, many: boolean): FloorPart[] {
  switch (missCode) {
    case "needs_newer":
      return [text(`${verb("needs", "need", many)} a newer PHP than `), ...ref(true)];
    case "stops_before":
      return [text(`${verb("stops", "stop", many)} before `), ...ref(false)];
    case "skips":
      return [text(`${verb("skips", "skip", many)} `), ...ref(false)];
    case "unsatisfiable":
      return [text(`${verb("admits", "admit", many)} no PHP version`)];
    default: {
      const words = [text(`${verb("does", "do", many)} not admit `), ...ref(false)];
      return missCode === null ? words : [...words, ...asWritten(missCode)];
    }
  }
}

function blockedWords(by: string, many: boolean): FloorPart[] {
  return [text(`${verb("is", "are", many)} blocked by `), code(by)];
}

function orNames(keys: readonly FloorKey[], namer: Namer): FloorPart[] {
  return keys.length === 2 && namer.pairSaid()
    ? [text("either")]
    : keys.flatMap((key, i) => [...(i > 0 ? [text(" or ")] : []), ...namer.one(key, false)]);
}

function neitherWords(namer: Namer, floors: Floors, many: boolean, way: string | null): FloorPart[] {
  const tail = way === null ? [] : asWritten(way);
  if (namer.pairSaid()) return [text(`${verb("admits", "admit", many)} neither`), ...tail];
  const [first, second] = named(floors);
  return [
    text(`${verb("admits", "admit", many)} neither `),
    ...namer.one(first ?? "project", false),
    text(" nor "),
    ...namer.one(second ?? "target", false),
    ...tail,
  ];
}

interface Said {
  readonly words: FloorPart[];
  /** False when the words leave something to level 1: the way a floor is missed, or what a
   *  blocked row admits. */
  readonly stated: boolean;
}

/**
 * Where the words stand: a level-1 line or a fold cell says all; level 0 says yours' misses without
 * the floor it admits, and a newer row blocked only as blocked, missing one of two floors as
 * admitting the other. What level 0 leaves out waits at level 1.
 */
type Place = "cell" | "yours" | "newer";

/** What a row, or `many` rows alike, do against the floors. */
function standingSaid(st: Standing, namer: Namer, floors: Floors, many: boolean, at: Place): Said {
  const brief = at === "newer";
  switch (st.kind) {
    case "unrecorded":
      return {
        words: [
          text(
            `${verb("has", "have", many)} no php recorded, so ${namer.two ? "neither could be" : "it could not be"} checked`,
          ),
        ],
        stated: true,
      };
    case "unanswered":
      return {
        words: [text(`${verb("has", "have", many)} no answer for `), ...orNames(st.floors, namer)],
        stated: true,
      };
    case "admits": {
      if (brief && st.blockedBy !== null) return { words: blockedWords(st.blockedBy, many), stated: false };
      const keys = named(floors);
      const what = keys.length === 2 ? namer.pair() : namer.one(keys[0] ?? "target", false);
      const words = [text(`${verb("admits", "admit", many)} `), ...what];
      return {
        words: st.blockedBy === null ? words : [...words, text(" but "), ...blockedWords(st.blockedBy, many)],
        stated: true,
      };
    }
    case "misses":
      return missesSaid(st, namer, floors, many, at);
  }
}

function missesSaid(
  st: Extract<Standing, { kind: "misses" }>,
  namer: Namer,
  floors: Floors,
  many: boolean,
  at: Place,
): Said {
  const [first, second] = st.misses;
  let words: FloorPart[];
  let stated = true;
  if (first !== undefined && second !== undefined && first.code === second.code) {
    words =
      first.code !== null && KNOWN.has(first.code)
        ? wayWords(first.code, () => namer.pair(), many)
        : neitherWords(namer, floors, many, first.code);
  } else if (
    first !== undefined &&
    second === undefined &&
    at === "newer" &&
    namer.two &&
    namer.pairSaid() &&
    st.unanswered.length === 0 &&
    first.code !== "unsatisfiable"
  ) {
    const other: FloorKey = first.floor === "project" ? "target" : "project";
    words = [text(`${verb("admits", "admit", many)} only `), ...namer.one(other, false)];
    stated = false;
  } else {
    words = st.misses.flatMap((miss, i) => [
      ...(i > 0 ? [text(" and ")] : []),
      ...wayWords(miss.code, (than) => namer.one(miss.floor, than), many),
    ]);
    const other = admitted(st, namer);
    if (other !== null) {
      if (at !== "cell") stated = false;
      else words = [...words, text(` but ${verb("admits", "admit", many)} `), ...namer.one(other, false)];
    }
  }
  const unanswered =
    st.unanswered.length === 0
      ? []
      : [text(` and ${verb("has", "have", many)} no answer for `), ...orNames(st.unanswered, namer)];
  const blocked = st.blockedBy === null ? [] : [text(" and "), ...blockedWords(st.blockedBy, many)];
  return { words: [...words, ...unanswered, ...blocked], stated };
}

/** The one of two floors a row missing the other admits; null when that is not all it does. */
function admitted(st: Extract<Standing, { kind: "misses" }>, namer: Namer): FloorKey | null {
  const [only, second] = st.misses;
  if (!namer.two || only === undefined || second !== undefined) return null;
  if (st.unanswered.length > 0 || only.code === "unsatisfiable") return null;
  return only.floor === "project" ? "target" : "project";
}

/** What a row, or `many` rows alike, do against the floors, in a list line or a cell. */
export function standingWords(st: Standing, floors: Floors, many: boolean): FloorPart[] {
  return standingSaid(st, cellNamer(floors), floors, many, "cell").words;
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
function groupBy(placed: readonly Placed[], floors: Floors): Placed[][] {
  const groups = new Map<string, Placed[]>();
  for (const p of placed) {
    const k = key(standingWords(p.st, floors, false));
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

function capitalise(parts: readonly FloorPart[]): FloorPart[] {
  const [first, ...rest] = parts;
  if (first?.kind !== "text") return [...parts];
  return [text(first.text.charAt(0).toUpperCase() + first.text.slice(1)), ...rest];
}

export type FloorItem =
  | { readonly kind: "one"; readonly branch: string; readonly yours: boolean }
  /** Ascending, as the fold rows' range cells read: `from` is the oldest. */
  | { readonly kind: "run"; readonly from: string; readonly to: string; readonly count: number };

export interface FloorGroup {
  readonly items: readonly FloorItem[];
  readonly words: readonly FloorPart[];
}

export interface FloorsAnswer {
  /** Level 0, after the sub-sentence. */
  readonly sentence: readonly FloorPart[];
  /** Level 1: every branch the sentence did not fully say, by standing; empty when it said all. */
  readonly rest: readonly FloorGroup[];
}

interface Scene {
  readonly floors: Floors;
  readonly considered: readonly Placed[];
  readonly hasMine: boolean;
  readonly mineIsNewest: boolean;
  readonly installedVersion: string;
}

/**
 * Level 0: yours first, with the floors in full, then the newer branches, alike ones in one clause
 * (every branch when none is yours). Older branches, the way a newer one misses one of two floors
 * and what a blocked one admits are left to level 1.
 */
export function floorsAnswer(
  rows: readonly BranchRow[],
  floors: Floors,
  installedVersion: string,
): FloorsAnswer | null {
  const all = place(rows, floors);
  if (all.length === 0) return null;
  const mineAt = rows.findIndex((row) => row.installed);
  const hasMine = mineAt >= 0 && all.some((p) => p.index === mineAt);
  const scene: Scene = {
    floors,
    considered: hasMine ? all.filter((p) => p.index <= mineAt) : all,
    hasMine,
    mineIsNewest: mineAt === 0,
    installedVersion,
  };
  let headed = false;
  let spoken = speak(scene, headed);
  // A clause opening on a mono branch name runs into the sub-sentence's own mono figures
  // ("released 1.6.2 on 2019-01-23 (…). 1.x stops …"), so the floors lead instead.
  if (spoken.parts[0]?.kind === "name") {
    headed = true;
    spoken = speak(scene, headed);
  }
  const prefix = floors.noProjectFloor ? [text("The project names no PHP floor. ")] : [];
  const head = headed
    ? [text("Against "), ...joinAnd(named(floors).map((k) => fullName(k, floors))), text(": ")]
    : [];
  return {
    sentence: [...prefix, ...(headed ? [...head, ...spoken.parts] : capitalise(spoken.parts)), text(".")],
    rest: listed(
      all.filter((p) => !spoken.stated.has(p.index)),
      floors,
    ),
  };
}

function speak(scene: Scene, headed: boolean): { parts: FloorPart[]; stated: Set<number> } {
  const { considered, floors } = scene;
  const namer = sentenceNamer(floors, headed);
  const grouped = groupBy(considered, floors);
  const mine = grouped.find((g) => g.some((p) => p.row.installed));
  const groups = mine === undefined ? grouped : [mine, ...grouped.filter((g) => g !== mine)];
  const newerMisses = groups.filter((g) => g !== mine && g[0]?.st.kind === "misses");
  const summarise = newerMisses.length > MISS_KINDS_MAX;
  const clauses: FloorPart[][] = [];
  const stated = new Set<number>();
  let counted = false;
  for (const group of groups) {
    const lead = group[0];
    if (lead === undefined) continue;
    if (summarise && newerMisses.includes(group)) {
      if (group === newerMisses[0]) clauses.push(missSummary(scene, newerMisses.flat(), namer));
      continue;
    }
    const isMine = group === mine;
    const names = who(group, scene, counted);
    const said = standingSaid(lead.st, namer, floors, group.length > 1, isMine ? "yours" : "newer");
    clauses.push([...names.parts, text(" "), ...said.words]);
    if (said.stated) for (const p of names.named) stated.add(p.index);
    counted ||= group.filter((p) => !p.row.installed).length > NAMED_MAX;
  }
  return { parts: clauses.flatMap((c, i) => [...(i > 0 ? [text("; ")] : []), ...c]), stated };
}

/** "yours, 7.x and 6.x", or "yours and 4 newer branches"; `counted` says a count came before, so
 *  this one needs no noun. `named` are the rows the words name one by one. */
function who(
  group: readonly Placed[],
  scene: Scene,
  counted: boolean,
): { parts: FloorPart[]; named: readonly Placed[] } {
  const mine = group.find((p) => p.row.installed);
  const others = group.filter((p) => p !== mine);
  const many = others.length > NAMED_MAX;
  const noun = counted ? "" : ` ${scene.hasMine ? "newer " : ""}branches`;
  const names: FloorPart[][] = many
    ? [[text(`${String(others.length)}${noun}`)]]
    : others.map((p) => [name(p.row.branch)]);
  const named = [...(mine === undefined ? [] : [mine]), ...(many ? [] : others)];
  if (mine === undefined) return { parts: joinAnd(names), named };
  // Yours' php is its newest release's requirement: when that is not the version installed, say so.
  const release = mine.row.newestDated;
  const yours: FloorPart[] =
    mine.st.kind === "misses" && release !== null && release !== scene.installedVersion
      ? [text("yours (as of "), name(release), text(")")]
      : others.length === 0 && scene.mineIsNewest
        ? [text("yours, the newest,")]
        : [text("yours")];
  return { parts: joinAnd([yours, ...names]), named };
}

/** "no newer branch admits both, 6.x missing them differently". */
function missSummary(scene: Scene, missing: readonly Placed[], namer: Namer): FloorPart[] {
  const { considered, floors, hasMine } = scene;
  const newer = considered.filter((p) => !p.row.installed).length;
  const keys = named(floors);
  const noun = hasMine ? "newer branch" : "branch";
  const head =
    missing.length === newer
      ? [
          text(`no ${noun} admits `),
          ...(keys.length === 2 ? namer.pair() : namer.one(keys[0] ?? "target", false)),
        ]
      : [
          text(`${String(missing.length)} of the ${String(newer)} ${noun}es `),
          ...(keys.length === 2 && namer.pairSaid()
            ? [text("miss one or both")]
            : [
                text("do not admit "),
                ...(keys.length === 2 ? namer.pair() : namer.one(keys[0] ?? "target", false)),
              ]),
        ];
  const odd = missing.filter((p) => differ(p.st));
  if (odd.length === 0) return head;
  return [
    ...head,
    text(", "),
    ...joinAnd(odd.map((p) => [name(p.row.branch)])),
    text(" missing them differently"),
  ];
}

/** Contiguous rows past this many read as one run, "0.1.x – 0.7.x (7)". */
const RUN_MIN = 3;

function runsOf(group: readonly Placed[]): FloorItem[] {
  const items: FloorItem[] = [];
  let run: Placed[] = [];
  const flush = (): void => {
    const newest = run[0];
    const oldest = run[run.length - 1];
    if (newest !== undefined && oldest !== undefined && run.length >= RUN_MIN) {
      items.push({ kind: "run", from: oldest.row.branch, to: newest.row.branch, count: run.length });
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

/** One line per kind of standing, every branch named, contiguous runs compressed. */
function listed(placed: readonly Placed[], floors: Floors): FloorGroup[] {
  return groupBy(placed, floors).flatMap((group) => {
    const lead = group[0];
    if (lead === undefined) return [];
    return [{ items: runsOf(group), words: standingWords(lead.st, floors, group.length > 1) }];
  });
}

/** What a fold row hides, in its range cell: "2 stop before both", or null when none misses. */
export function foldWords(rows: readonly BranchRow[], floors: Floors): string | null {
  const missing = place(rows, floors).flatMap((p) => (p.st.kind === "misses" ? [p.st] : []));
  const [first] = missing;
  if (first === undefined) return null;
  const n = String(missing.length);
  const many = missing.length > 1;
  const keys = named(floors);
  const only = first.misses[0]?.floor;
  if (
    keys.length === 2 &&
    missing.every(
      (st) =>
        st.misses.length === 1 &&
        st.misses[0]?.floor === only &&
        st.misses[0]?.code !== "unsatisfiable" &&
        st.unanswered.length === 0,
    )
  ) {
    const other: FloorKey = only === "project" ? "target" : "project";
    return `${n} ${verb("admits", "admit", many)} only ${plain(shortName(other, floors, false))}`;
  }
  const firstKey = key(standingWords(first, floors, false));
  const alike = missing.every((st) => key(standingWords(st, floors, false)) === firstKey);
  const unknownWay = first.misses.some((m) => m.code !== null && !KNOWN.has(m.code));
  if (alike && !unknownWay) return `${n} ${plain(standingWords(first, floors, many))}`;
  if (keys.length === 2) return `${n} ${verb("misses", "miss", many)} one or both`;
  return `${n} ${verb("does", "do", many)} not admit ${plain(shortName(keys[0] ?? "target", floors, false))}`;
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

/**
 * S8's answer when the newest branch is out of reach, after "its last release was 4.5 years ago",
 * in the ledger why's word: "; 7.x is the newest that fits", or "; no newer branch fits". Why the
 * newest does not is the Release branches sentence's to say, so the lead stays as long as it was.
 * Null keeps the older sentence: the newest within reach, or a document that does not say.
 */
export function moveClause(data: Signal["data"] | undefined): FloorPart[] | null {
  if (data?.["newest_within_reach"] !== false || str(data, "newest_branch") === null) return null;
  const reachable = str(data, "reachable_branch");
  return reachable === null
    ? [text("; no newer branch fits")]
    : [text("; "), name(reachable), text(" is the newest that fits")];
}
