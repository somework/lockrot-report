import { useReport } from "../context";
import { population, railGroups, type RailGroup } from "../../domain/filters";
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

function Opt({ group, row }: { group: RailGroup; row: RailGroup["rows"][number] }) {
  const { dispatch } = useReport();
  return (
    <button
      type="button"
      className={group.group === "gate" ? "opt opt-gate" : "opt"}
      aria-pressed={row.on}
      title={group.group === "signal" ? signalDef(row.key) : undefined}
      onClick={() => {
        dispatch({ type: "toggle", group: group.group, key: row.key });
      }}
    >
      {group.group === "signal" ? <span className="mono">{row.key}</span> : null}
      {" " + row.label} <span className="c">{row.count}</span>
    </button>
  );
}

/** "Fails this run" sits in the Since group when there is one: both say where a finding stands
 *  against this run, and an eyebrow of its own would cost the rail a line for one row. */
function placed(groups: readonly RailGroup[]): readonly (readonly [RailGroup, RailGroup | null])[] {
  const gate = groups.find((g) => g.group === "gate") ?? null;
  const since = groups.some((g) => g.group === "since");
  return groups
    .filter((g) => !(since && g.group === "gate"))
    .map((g) => [g, g.group === "since" ? gate : null] as const);
}

/**
 * The filter rail: layout of `railGroups()` plus `aria-pressed` on each button. Hidden once the tab
 * has nothing to filter; when the filters leave no row anything to add, it says so in one line.
 */
export function Rail() {
  const { model, state } = useReport();
  if (population(model, state.view).length === 0) return null;
  const groups = railGroups(model, state);

  return (
    <div className="rail" role="group" aria-label="Filters">
      {groups.length === 0 && <p className="rail-empty">Nothing here narrows the list further.</p>}
      {placed(groups).map(([group, extra]) => (
        <div className="rail-group" key={group.group}>
          <span className="eyebrow">
            <RailTitle
              title={group.title}
              path={group.group === "since" ? model.report.baseline?.path : undefined}
            />
          </span>
          <div className="opts">
            {group.rows.map((row) => (
              <Opt key={row.key} group={group} row={row} />
            ))}
            {extra?.rows.map((row) => (
              <Opt key={`gate:${row.key}`} group={extra} row={row} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
