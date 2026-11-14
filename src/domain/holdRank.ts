import type { HeldBy, Run } from "../model/report";

export type RankedHold = Pick<HeldBy, "source" | "package" | "target" | "holder">;

/** The holder group: the root, its own releases, the holds on the finding's package, then the rest. A
 *  null `target` names the finding's package. */
function holdGroup(h: RankedHold, own: string): number {
  if (h.source === "root") return 0;
  if (h.package === own) return 1;
  return h.target === null || h.target === own ? 2 : 3;
}

/** An own release takes no grade: its holder record is the installed version's. */
function holdGrade(h: RankedHold, run: Run, own: string): number {
  const graded: readonly string[] = run.graded_verdicts;
  const verdict = h.package === own ? "" : (h.holder?.verdict ?? "");
  return graded.includes(verdict) ? graded.indexOf(verdict) : graded.length;
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** §7.9.13's holder rank, on every surface: by group, then by grade in
 *  `run.graded_verdicts`, then by name. `own` is the finding's package. Array sort is stable, so
 *  equal holds keep data order. */
export function compareHolds(a: RankedHold, b: RankedHold, run: Run, own: string): number {
  return (
    holdGroup(a, own) - holdGroup(b, own) ||
    holdGrade(a, run, own) - holdGrade(b, run, own) ||
    byName(a.package ?? "", b.package ?? "")
  );
}
