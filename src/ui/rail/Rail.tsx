import { useReport } from "../context";
import { population, railGroups } from "../../domain/filters";
import { signalDef } from "../../domain/vocab";
import "./rail.css";

/** The baseline file name keeps its case, on its own line: set in the eyebrow's capitals it broke
 *  at its hyphen. */
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
 * The filter rail: layout of `railGroups()` plus `aria-pressed` on each button. Hidden once the tab
 * has nothing to filter; when the filters leave no row anything to add, it says so in one line.
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
                title={group.group === "signal" ? signalDef(row.key) : undefined}
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
