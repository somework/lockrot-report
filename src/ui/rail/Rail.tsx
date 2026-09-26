import { useReport } from "../context";
import { population, railGroups } from "../../domain/filters";
import { SIGNAL_DEFS } from "../../domain/vocab";
import "./rail.css";

/**
 * A group's title. The Since group's names the baseline file ("Since lockrot-baseline.json"): set in
 * the eyebrow's capitals, a hyphenated file name broke across two lines at its hyphen. The file name
 * keeps its own case, in the mono every other file name on the page takes, on a line of its own that
 * breaks only if the name is wider than the rail.
 */
function RailTitle({ title, path }: { title: string; path: string | undefined }) {
  if (path === undefined || path === "" || !title.endsWith(path)) return <>{title}</>;
  return (
    <>
      {title.slice(0, title.length - path.length)}
      <span className="rail-path">{path}</span>
    </>
  );
}

/**
 * The left-hand filter rail: the since/scope/signal/fix groups `railGroups()` (domain/filters.ts)
 * hands back for the current tab, each row a toggle button. Ported from legacy `renderRail()`
 * (`report.js:319-394`).
 *
 * `railGroups()` already carries the group order, the row labels and the counts. A count is what
 * the list would show with that row selected and everything else the reader chose still on
 * (PD-RAIL-2, DESIGN.md §5 — legacy's counts ignored the other filters, M18); a row that would show
 * nothing is left out unless it is on. This component's only job is layout, plus `aria-pressed` on
 * each button (M17's fix, extended to the rail's own controls for consistency with the ledger's).
 *
 * Hidden entirely — no groups, no rail at all — once the current tab has nothing to filter
 * (`population(model, state.view).length === 0`), the same emptiness check the search bar and hint
 * use, and the one legacy makes before building any group (`report.js:322-327`). When the tab has
 * packages but the search box and the chips leave no row anything to add, the rail says so in one
 * line rather than standing empty.
 */
export function Rail() {
  const { model, state, dispatch } = useReport();
  if (population(model, state.view).length === 0) return null;
  const groups = railGroups(model, state);

  return (
    <div className="rail" role="group" aria-label="Filters">
      {groups.length === 0 && <p className="rail-empty">Nothing here narrows the list further.</p>}
      {groups.map((group) => (
        <div className="rail-group" key={group.group}>
          <span className="eyebrow">
            <RailTitle
              title={group.title}
              path={group.group === "since" ? model.report.baseline?.path : undefined}
            />
          </span>
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
