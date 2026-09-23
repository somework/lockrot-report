import { useReport } from "../context";
import { population, railGroups } from "../../domain/filters";
import { SIGNAL_DEFS } from "../../domain/vocab";
import "./rail.css";

/**
 * The left-hand filter rail: the since/scope/signal/fix groups `railGroups()` (domain/filters.ts)
 * hands back for the current tab, each row a toggle button. Ported from legacy `renderRail()`
 * (`report.js:319-394`).
 *
 * `railGroups()` already carries the group order, the row labels and the per-tab counts —
 * DESIGN.md's "deliberately kept" non-faceted counts (M18): a count here is the tab's whole
 * population, not narrowed by whatever else is already selected. This component's only job is
 * layout, plus `aria-pressed` on each button (M17's fix, extended to the rail's own controls for
 * consistency with the ledger's).
 *
 * Hidden entirely — no groups, no rail at all — once the current tab has nothing to filter
 * (`population(model, state.view).length === 0`), the same emptiness check the search bar and hint
 * use, and the one legacy makes before building any group (`report.js:322-327`).
 */
export function Rail() {
  const { model, state, dispatch } = useReport();
  if (population(model, state.view).length === 0) return null;

  return (
    <div className="rail" role="group" aria-label="Filters">
      {railGroups(model, state).map((group) => (
        <div className="rail-group" key={group.group}>
          <span className="eyebrow">{group.title}</span>
          <div className="opts">
            {group.rows.map((row) => (
              <button
                key={row.key}
                type="button"
                className="opt"
                aria-pressed={row.on}
                title={group.group === "signal" ? SIGNAL_DEFS[row.key] : undefined}
                onClick={() => {
                  dispatch({ type: "toggle", group: group.group, key: row.key });
                }}
              >
                {group.group === "signal" ? <span className="mono">{row.key}</span> : null}
                {" " + row.label} <span className="c">{row.count}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
