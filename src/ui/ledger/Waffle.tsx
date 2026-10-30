import type { WaffleRun } from "../../domain/summary";
import { toneClass } from "../common/common";

/**
 * One square per package, in `run.verdicts` order, row by row at a fixed column count (ledger.css):
 * the waffle keeps one width on every page, and a bigger lock grows rows. `aria-hidden`: the grade
 * line, the chips and the key say every number this draws.
 */
export function Waffle({ runs }: { runs: readonly WaffleRun[] }) {
  const cells = runs.flatMap((run) =>
    Array.from({ length: run.count }, (_, index) => (
      <i
        key={`${run.verdict}-${String(index)}`}
        className={`waffle-cell is-${run.mark} ${toneClass(run.tone)}`}
      />
    )),
  );
  return (
    <div className="waffle" aria-hidden="true">
      {cells}
    </div>
  );
}

/** The key for the squares the grade chips do not name: allowlisted, no metadata and ok. */
export function WaffleKey({ runs }: { runs: readonly WaffleRun[] }) {
  return (
    <ul className="waffle-key">
      {runs
        .filter((run) => run.tone === "none" || run.tone === "unk")
        .map((run) => (
          <li key={run.verdict}>
            <i className={`waffle-cell is-${run.mark} ${toneClass(run.tone)}`} aria-hidden="true" />
            {run.label} <span className="waffle-key-n">{run.count}</span>
          </li>
        ))}
    </ul>
  );
}
