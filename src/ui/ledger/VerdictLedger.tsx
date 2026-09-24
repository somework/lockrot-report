import { useReport } from "../context";
import { LegendButton, toneClass } from "../common/common";
import { TONE } from "../../domain/vocab";
import { VERDICTS } from "../../model/types";
import "./ledger.css";

/**
 * The verdict distribution across every package the run checked. Ported from legacy
 * `renderLedger()`'s verdict block (`report.js:260-271`). Unlike `PriorityLedger`, a verdict with
 * a zero count is skipped entirely rather than shown at zero — that asymmetry is the brief's, and
 * mirrors legacy's own `if (!n) return;` (`report.js:262`), so a document that never produced a
 * `stale` finding never gets an empty `stale` button here either.
 *
 * `ok` renders dimmed (`opacity:.35` in legacy, `report.js:264,267`) because it is the "nothing to
 * see" bucket, not a rot signal — every other verdict stays at full opacity.
 *
 * A verdict this renderer does not know (a document from a future lockrot) still gets a segment and
 * a button, appended after the known ones at a neutral tone (`TONE()`'s own fallback) — DESIGN.md §2
 * requires unknown enum values to render neutrally, never to be dropped.
 */
export function VerdictLedger() {
  const { model, state, dispatch } = useReport();
  const counts = model.report.counts;
  const known = new Set<string>(VERDICTS);
  const unknown = Object.keys(counts).filter((v) => !known.has(v) && (counts[v] ?? 0) > 0);
  const shown: readonly string[] = [...VERDICTS.filter((v) => (counts[v] ?? 0) > 0), ...unknown];

  return (
    <div className="ledger-block">
      <span className="eyebrow">
        Verdicts across <span className="ledger-figure">{model.report.findings.length}</span> packages
      </span>
      <div className="bar" role="img" aria-label="Verdict distribution">
        {shown.map((v) => (
          <span
            key={v}
            className={`bar-seg ${toneClass(TONE(v))}${v === "ok" ? " bar-seg-dim" : ""}`}
            style={{ flexGrow: counts[v] ?? 0 }}
            title={`${v}: ${counts[v] ?? 0}`}
          />
        ))}
      </div>
      <div className="legend">
        {shown.map((v) => (
          <LegendButton
            key={v}
            tone={TONE(v)}
            dim={v === "ok"}
            pressed={state.filters.verdict.includes(v)}
            label={v}
            count={counts[v] ?? 0}
            onToggle={() => {
              dispatch({ type: "toggle", group: "verdict", key: v });
            }}
          />
        ))}
      </div>
    </div>
  );
}
