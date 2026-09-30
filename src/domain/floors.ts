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

function sentenceNamer(floors: Floors, headed: boolean, quoted: boolean): Namer {
  const keys = named(floors);
  const said = new Set<FloorKey>(headed ? keys : []);
  const two = keys.length === 2;
  const first = (key: FloorKey): FloorPart[] =>
    quoted ? fullName(key, floors) : shortName(key, floors, false);
  const one = (key: FloorKey, than: boolean): FloorPart[] => {
    const known = said.has(key);
    said.add(key);
    if (!known) return key === "target" && than ? [text(floors.target ?? "")] : first(key);
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

/**
 * One way of missing, against a floor or a pair: "needs a newer PHP than 8.4", "stop before both".
 * Against the project's floor alone the way names its lowest PHP, the one lockrot tests: "needs a
 * newer PHP than your `require.php` allows at its lowest".
 */
function wayWords(
  missCode: string | null,
  ref: Ref,
  many: boolean,
  floor: FloorKey | null = null,
): FloorPart[] {
  if (floor === "project") return projectWayWords(missCode, ref, many);
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

/** `ref(true)` never reads "it": the floor is the constraint's lowest PHP, which "it" would blur. */
function projectWayWords(missCode: string | null, ref: Ref, many: boolean): FloorPart[] {
  const lowest = (): FloorPart[] => [text("the lowest PHP "), ...ref(true), text(" allows")];
  switch (missCode) {
    case "needs_newer":
      return [
        text(`${verb("needs", "need", many)} a newer PHP than `),
        ...ref(true),
        text(" allows at its lowest"),
      ];
    case "stops_before":
      return [text(`${verb("stops", "stop", many)} before `), ...lowest()];
    case "skips":
      return [text(`${verb("skips", "skip", many)} `), ...lowest()];
    case "unsatisfiable":
      return [text(`${verb("admits", "admit", many)} no PHP version`)];
    default: {
      const words = [text(`${verb("does", "do", many)} not admit `), ...lowest()];
      return missCode === null ? words : [...words, ...asWritten(missCode)];
    }
  }
}

/**
 * What a row that needs a newer PHP than the project's lowest, and misses nothing else, waits for:
 * "— it fits once your `require.php` starts higher". Empty for every other standing.
 */
export function fitsOnceWords(st: Standing, many: boolean): FloorPart[] {
  if (st.kind !== "misses" || st.misses.length !== 1) return [];
  const [miss] = st.misses;
  if (miss?.floor !== "project" || miss.code !== "needs_newer") return [];
  if (st.unanswered.length > 0 || st.blockedBy !== null) return [];
  return [
    text(` — ${many ? "they fit" : "it fits"} once your `),
    code("require.php"),
    text(" starts higher"),
  ];
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
  /** False when the words leave something to level 1: the floor a row missing the other admits,
   *  or what a blocked row admits. */
  readonly stated: boolean;
}

/**
 * Where the words stand: a level-1 line or a fold cell says all; level 0 says a row's misses without
 * the floor it admits, and a newer row blocked only as blocked. What level 0 leaves out waits at
 * level 1.
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
  } else {
    words = st.misses.flatMap((miss, i) => [
      ...(i > 0 ? [text(" and ")] : []),
      ...wayWords(miss.code, (than) => namer.one(miss.floor, than), many, miss.floor),
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

/**
 * How much level 0 says, fullest first; the page takes the first that keeps the sub within its
 * lines in the reader's fonts. `plain` leaves what a miss waits for ("it fits once …") to level 1's
 * list; `missing` keeps only the clauses that say a miss or a block, so why a branch does not fit outlasts the
 * ones that admit both; `unquoted` leaves `require.php`'s constraint to level 1's definitions;
 * `first` keeps one clause, the first that says a miss when one does, a newer branch's before yours:
 * why no newer branch fits is what the lead's move clause stands on.
 */
export const FLOORS_STEPS = [
  "full",
  "plain",
  "missing",
  "missing-plain",
  "unquoted",
  "missing-unquoted",
  "first",
] as const;
export type FloorsStep = (typeof FLOORS_STEPS)[number];

interface StepShape {
  readonly clauses: "all" | "missing" | "first";
  readonly quoted: boolean;
  readonly tail: boolean;
}

/** Whether the step quotes `require.php`'s constraint in the sentence, or leaves it to level 1. */
export function stepQuotes(step: FloorsStep): boolean {
  return SHAPES[step].quoted;
}

const SHAPES: Readonly<Record<FloorsStep, StepShape>> = {
  full: { clauses: "all", quoted: true, tail: true },
  plain: { clauses: "all", quoted: true, tail: false },
  unquoted: { clauses: "all", quoted: false, tail: false },
  missing: { clauses: "missing", quoted: true, tail: true },
  "missing-plain": { clauses: "missing", quoted: true, tail: false },
  "missing-unquoted": { clauses: "missing", quoted: false, tail: false },
  first: { clauses: "first", quoted: false, tail: false },
};

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
  step: FloorsStep = "full",
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
  const shape = SHAPES[step];
  const { quoted, tail } = shape;
  const spoken = (headed: boolean, only: boolean, newerOnly = false): readonly Clause[] =>
    speak(scene, { headed, quoted, tail, only, newerOnly }).clauses;
  const missed = shape.clauses === "all" ? [] : spoken(false, true);
  // Spoken again without yours: a newer clause said after yours may lean on yours' words ("it").
  const pick = missed.find((c) => c.newer);
  const newerFirst =
    pick === undefined || pick === missed[0] ? missed[0] : (spoken(false, true, true)[0] ?? pick);
  const missing = shape.clauses !== "first" ? missed : newerFirst === undefined ? [] : [newerFirst];
  // Spoken without the others, so the first clause kept is the one that quotes; its few words
  // name the floors themselves.
  let headed = false;
  let kept = missing;
  if (missing.length === 0) {
    const first =
      shape.clauses === "all" ? (all: readonly Clause[]) => all : (all: readonly Clause[]) => all.slice(0, 1);
    kept = first(spoken(headed, false));
    // A clause opening on a mono branch name runs into the sub-sentence's own mono version and
    // date, so the floors lead instead.
    if (kept[0]?.parts[0]?.kind === "name") {
      headed = true;
      kept = first(spoken(headed, false));
    }
  }
  const parts = kept.flatMap((c, i) => [...(i > 0 ? [text("; ")] : []), ...c.parts]);
  const stated = new Set(kept.flatMap((c) => c.stated));
  const prefix = floors.noProjectFloor ? [text("The project names no PHP floor. ")] : [];
  const naming = (k: FloorKey) => (quoted ? fullName(k, floors) : shortName(k, floors, false));
  const head = headed ? [text("Against "), ...joinAnd(named(floors).map(naming)), text(": ")] : [];
  return {
    sentence: [...prefix, ...(headed ? [...head, ...parts] : capitalise(parts)), text(".")],
    rest: listed(
      all.filter((p) => !stated.has(p.index)),
      floors,
    ),
  };
}

interface Clause {
  readonly parts: FloorPart[];
  /** The rows the clause says in full. */
  readonly stated: readonly number[];
  /** The clause says how its rows miss a floor. */
  readonly misses: boolean;
  /** The clause says a branch newer than yours. */
  readonly newer: boolean;
}

interface Voice {
  readonly headed: boolean;
  readonly quoted: boolean;
  /** Say what a miss waits for. */
  readonly tail: boolean;
  /** Only the clauses that say a miss. */
  readonly only: boolean;
  /** Leave yours out, so no kept clause leans on words only yours said. */
  readonly newerOnly?: boolean;
}

function speak(
  scene: Scene,
  { headed, quoted, tail, only, newerOnly = false }: Voice,
): { clauses: Clause[] } {
  const { considered, floors } = scene;
  const namer = sentenceNamer(floors, headed, quoted);
  const grouped = groupBy(considered, floors);
  const mine = grouped.find((g) => g.some((p) => p.row.installed));
  const groups = mine === undefined ? grouped : [mine, ...grouped.filter((g) => g !== mine)];
  const newerMisses = groups.filter((g) => g !== mine && g[0]?.st.kind === "misses");
  const summarise = newerMisses.length > MISS_KINDS_MAX;
  const clauses: Clause[] = [];
  let counted = false;
  for (const group of groups) {
    const lead = group[0];
    if (lead === undefined) continue;
    if (summarise && newerMisses.includes(group)) {
      if (group === newerMisses[0]) {
        clauses.push({
          parts: missSummary(scene, newerMisses.flat(), namer),
          stated: [],
          misses: true,
          newer: true,
        });
      }
      continue;
    }
    const keepsOut = lead.st.kind === "misses" || (lead.st.kind === "admits" && lead.st.blockedBy !== null);
    if (only && !keepsOut) continue;
    if (newerOnly && group === mine) continue;
    const isMine = group === mine;
    const names = who(group, scene, counted);
    const said = standingSaid(lead.st, namer, floors, group.length > 1, isMine ? "yours" : "newer");
    const waits = fitsOnceWords(lead.st, group.length > 1);
    clauses.push({
      parts: [...names.parts, text(" "), ...said.words, ...(tail ? waits : [])],
      stated: said.stated && (tail || waits.length === 0) ? names.named.map((p) => p.index) : [],
      misses: keepsOut,
      newer: group.some((p) => !p.row.installed),
    });
    counted ||= group.filter((p) => !p.row.installed).length > NAMED_MAX;
  }
  return { clauses };
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

/** "no newer branch admits both": how each one misses is a row's own words, level 1's to say. */
function missSummary(scene: Scene, missing: readonly Placed[], namer: Namer): FloorPart[] {
  const { considered, floors, hasMine } = scene;
  const newer = considered.filter((p) => !p.row.installed).length;
  const keys = named(floors);
  const noun = hasMine ? "newer branch" : "branch";
  return missing.length === newer
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
    const many = group.length > 1;
    return [
      {
        items: runsOf(group),
        words: [...standingWords(lead.st, floors, many), ...fitsOnceWords(lead.st, many)],
      },
    ];
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
    return `${n} ${verb("misses", "miss", many)} ${plain(shortName(only ?? "target", floors, false))}`;
  }
  const firstKey = key(standingWords(first, floors, false));
  const alike = missing.every((st) => key(standingWords(st, floors, false)) === firstKey);
  const unknownWay = first.misses.some((m) => m.code !== null && !KNOWN.has(m.code));
  if (alike && !unknownWay) return `${n} ${plain(standingWords(first, floors, many))}`;
  if (keys.length === 2) return `${n} ${verb("misses", "miss", many)} one or both`;
  return `${n} ${verb("does", "do", many)} not admit ${plain(shortName(keys[0] ?? "target", floors, false))}`;
}

export function plain(parts: readonly { readonly text: string }[]): string {
  return parts.map((part) => part.text).join("");
}

/** The level-1 definitions, once: what `php` is, what "admits" claims, which PHP the project's is,
 *  and S8's floor when it is neither of the run's own. */
export function floorsDefinition(floors: Floors, other: OtherFloor | null = null): FloorPart[] {
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
    ...(other === null ? [] : otherFloorWords(other)),
  ];
}

function str(data: Signal["data"] | undefined, field: string): string | null {
  const value = data?.[field];
  return typeof value === "string" && value !== "" ? value : null;
}

/** S8's floor when it is neither of the run's two, which the sentence already names. */
export interface OtherFloor {
  /** `floor_source` as written. */
  readonly source: string;
  /** `floor_php` as written. */
  readonly php: string;
}

export function otherFloor(data: Signal["data"] | undefined): OtherFloor | null {
  const source = str(data, "floor_source");
  const php = str(data, "floor_php");
  if (source === null || php === null || source === "project" || source === "target") return null;
  return { source, php };
}

/** Its own sentence, never tied to a row: which rows it blocks is theirs to say. */
function otherFloorWords(other: OtherFloor): FloorPart[] {
  return [text(" lockrot reads the "), code(other.source), text(" floor as "), code(other.php), text(".")];
}

/**
 * The lead's shorter wordings of S8's clause, fullest first: `short` drops "is the newest that",
 * `bare` also what it fits against, which Release branches says anyway.
 */
export const MOVE_STEPS = ["short", "bare"] as const;
export type MoveStep = (typeof MOVE_STEPS)[number];

/** Words the lead drops from the given step on; `text` is them in full, as paper reads them. */
export interface MoveDrop {
  readonly kind: "drop";
  readonly step: MoveStep;
  readonly text: string;
  readonly parts: readonly FloorPart[];
}

export type MovePart = FloorPart | MoveDrop;

const drop = (step: MoveStep, parts: readonly FloorPart[]): MovePart[] =>
  parts.length === 0 ? [] : [{ kind: "drop", step, text: plain(parts), parts }];

/**
 * S8's answer when the newest branch is out of reach, after the lead's age clause, in the ledger
 * why's word and against S8's own floor: "; <reachable_branch> is the newest that fits your
 * `require.php`", or "; no newer branch fits PHP 8.4". Why the newest does not fit is the Release
 * branches sentence's to say. Null when the newest is within reach or the document does not say.
 */
export function moveClause(data: Signal["data"] | undefined): MovePart[] | null {
  if (data?.["newest_within_reach"] !== false || str(data, "newest_branch") === null) return null;
  const reachable = str(data, "reachable_branch");
  const against = drop("bare", fitsWhat(data));
  return reachable === null
    ? [text("; no newer branch fits"), ...against]
    : [
        text("; "),
        name(reachable),
        ...drop("short", [text(" is the newest that")]),
        text(" fits"),
        ...against,
      ];
}

/** S8's `floor_source` in the sentence's names; one this page does not know as written; nothing
 *  when S8 names none. */
function fitsWhat(data: Signal["data"] | undefined): FloorPart[] {
  const source = str(data, "floor_source");
  const php = str(data, "floor_php");
  if (source === "project") return [text(" your "), code("require.php")];
  if (source === "target")
    return php === null ? [text(" the target PHP")] : [text(" "), phrase(`PHP ${php}`)];
  return source === null ? [] : [text(" the "), code(source), text(" floor")];
}
