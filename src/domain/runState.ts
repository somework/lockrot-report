/** Overview's state lines: what limits this run's answer, read from `note_details[].code`,
 *  `security.check`, `counts`, `run.php_window` and the root `baseline`. One line per state that applies. */

import type { Report2 } from "../model/report";
import type { LinkTarget } from "../state/types";
import { plural } from "./format";
import { phpStateClauses } from "./phpWindow";

export type StateKind = "lookup" | "php" | "allowlist" | "baseline";

export interface StatePart {
  readonly text: string;
  /** A count that opens its list, or null for plain text. */
  readonly link: LinkTarget | null;
}

export interface StateLine {
  readonly kind: StateKind;
  /** The bold head before ": "; the allowlist line has none. */
  readonly head: string | null;
  readonly parts: readonly StatePart[];
  readonly more: { readonly text: string; readonly link: LinkTarget } | null;
}

const RUN_DATA: LinkTarget = { view: "run" };
const plain = (text: string): StatePart => ({ text, link: null });
const hasNote = ({ note_details: notes }: Report2, code: string): boolean =>
  notes.some((n) => n.code === code);

function lookupLine(report: Report2): StateLine | null {
  const { security, counts, packages_checked: checked } = report;
  const offline = hasNote(report, "offline");
  const parts = [
    ...(security.check === "not_run" ? [plain("no advisory check ran")] : []),
    ...(security.check === "partial" ? [plain("the advisory lookup was partial")] : []),
    ...(counts.unknown > 0
      ? [
          plain(
            `${String(counts.unknown)} of ${plural(checked, "package", "packages")} ${counts.unknown === 1 ? "has" : "have"} no grade, because lockrot read no metadata for ${counts.unknown === 1 ? "it" : "them"}`,
          ),
        ]
      : []),
  ];
  if (!offline && parts.length === 0) return null;
  return {
    kind: "lookup",
    head: offline ? "Offline run" : "Incomplete data",
    parts,
    more: { text: "What this run could not see", link: RUN_DATA },
  };
}

function phpLine(report: Report2): StateLine | null {
  const clauses = phpStateClauses(report);
  if (clauses === null) return null;
  return {
    kind: "php",
    head: "PHP",
    parts: clauses.map(plain),
    more: { text: "The PHP window", link: RUN_DATA },
  };
}

/** Only when the project's ignore list names packages whose advisories still count. */
function allowlistLine(report: Report2): StateLine | null {
  const note = report.note_details.find((n) => n.code === "ignore_does_not_cover_advisories");
  if (note === undefined) return null;
  const entries = (note.data as { entries?: unknown }).entries;
  const listed = Array.isArray(entries) ? entries.length : 0;
  return {
    kind: "allowlist",
    head: null,
    parts: [
      plain("extra.lockrot.ignore accepts maintenance flags, not advisories"),
      ...(listed > 0
        ? [
            plain(
              `${plural(listed, "package", "packages")} it lists still ${listed === 1 ? "counts" : "count"} for advisories`,
            ),
          ]
        : []),
    ],
    more: { text: "The run note", link: RUN_DATA },
  };
}

function baselineLine({ baseline }: Report2): StateLine | null {
  if (baseline === null) return null;
  const since = (key: string): LinkTarget => ({ view: "findings", filters: { since: [key] } });
  const count = (n: number, word: string, key: string): StatePart => ({
    text: `${String(n)} ${word}`,
    link: n > 0 ? since(key) : null,
  });
  const stale = baseline.stale;
  return {
    kind: "baseline",
    head: `Against ${baseline.path}`,
    parts: [
      count(baseline.new, "new", "new"),
      count(baseline.worsened, "worsened", "worsened"),
      count(baseline.known, "known", "known"),
      ...(stale.length > 0
        ? [
            plain(
              `${plural(stale.length, "entry", "entries")} for packages that left the lock: ${stale.join(", ")}`,
            ),
          ]
        : []),
    ],
    more: null,
  };
}

export function stateLines(report: Report2): StateLine[] {
  return [lookupLine(report), phpLine(report), allowlistLine(report), baselineLine(report)].filter(
    (line): line is StateLine => line !== null,
  );
}

/** A state line as one string: the head and ": ", the clauses joined " · ", ".", then the link words. */
export const stateLineText = ({ head, parts, more }: StateLine): string =>
  `${head === null ? "" : `${head}: `}${parts.map(({ text }) => text).join(" · ")}.${more === null ? "" : ` ${more.text}`}`;
