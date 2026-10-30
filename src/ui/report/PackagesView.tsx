import { useId, useRef } from "preact/hooks";
import type { Finding, Report2, Run } from "../../model/report";
import { applyFilters2, HIDE_ACCEPTED, population2 } from "../../domain/list";
import { gradeTone, shownPills } from "../../domain/findingRow";
import {
  dataAsOf,
  dataCaption,
  installedAge,
  libyearsCell,
  PACKAGES_COLUMNS,
  reachedWord,
  showsDataColumn,
  signalKey,
  type Cell,
} from "../../domain/packageCells";
import { signalName } from "../../domain/pageVocabulary";
import { useReport } from "../context";
import { useOverflowX } from "../useOverflowX";
import { RowHint, toneClass } from "../common/common";
import { usePrinted } from "../print/printContext";
import { rowTabIndex } from "../rowCursor";
import { openInteractions } from "../rowOpen";
import { EmptyState } from "../views/EmptyState";
import { FlagPills } from "./FlagPills";
import { Version } from "./PackageWord";
import { useReport2 } from "./useReport";
import "../views/views.css";
import "./packages.css";

/** A dash or a lower bound says what it stands for, to the eye on hover and to a screen reader. */
function Measured({ cell }: { cell: Cell }) {
  if (cell.label === null) return <>{cell.text}</>;
  return (
    <span title={cell.label}>
      <span aria-hidden="true">{cell.text}</span>
      <span className="vh">{cell.label}</span>
    </span>
  );
}

/** Wraps after the vendor's slash, never at a hyphen. */
function PackageName({ name }: { name: string }) {
  const slash = name.indexOf("/");
  if (slash < 0) return <>{name}</>;
  return (
    <span className="pkg-word">
      <span className="p2-unit">{name.slice(0, slash + 1)}</span>
      <wbr />
      <span className="p2-unit">{name.slice(slash + 1)}</span>
    </span>
  );
}

type Column = (typeof PACKAGES_COLUMNS)[number];
const label = (key: Column["key"]): string => PACKAGES_COLUMNS.find((c) => c.key === key)?.label ?? key;

/** The codes say their names on hover; the head's key lists them all for the keyboard. */
function Signals({ finding }: { finding: Finding }) {
  if (finding.signals.length === 0) return <>—</>;
  const ids = finding.signals.map((signal) => signal.id);
  return <span title={ids.map((id) => `${id} ${signalName(id)}`).join(", ")}>{ids.join(" ")}</span>;
}

function PackageRow({
  finding,
  report,
  hideAccepted,
  showData,
}: {
  finding: Finding;
  report: Report2;
  hideAccepted: boolean;
  showData: boolean;
}) {
  const { state, dispatch, cursor } = useReport();
  const run: Run = report.run;
  const graded = run.graded_verdicts.some((verdict) => verdict === finding.verdict);
  return (
    <tr
      role="row"
      className={graded ? `p2-row ${toneClass(gradeTone(finding.verdict))}` : "p2-row is-ungraded"}
      data-pkg={finding.package}
      aria-label={finding.package}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      tabIndex={rowTabIndex(finding.package, cursor)}
      {...openInteractions(finding.package, dispatch)}
    >
      <td role="cell" className="p2-name">
        <PackageName name={finding.package} />
      </td>
      <td role="cell" className="num p2-ver" data-label={label("version")}>
        <Version version={finding.version} className="p2-v" />
      </td>
      <td role="cell" className="num p2-ly" data-label={label("libyears")}>
        <Measured cell={libyearsCell(finding)} />
      </td>
      <td role="cell" className="p2-age" data-label={label("age")}>
        <Measured cell={installedAge(finding)} />
      </td>
      <td role="cell" className="p2-verdict" data-label={label("verdict")}>
        {finding.verdict}
      </td>
      <td role="cell" className="num p2-score" data-label={label("score")}>
        {finding.score.total}
      </td>
      <td role="cell" className="p2-flags" data-label={label("flags")}>
        {shownPills(finding, run, hideAccepted).length === 0 ? (
          "—"
        ) : (
          <FlagPills finding={finding} run={run} hideAccepted={hideAccepted} />
        )}
      </td>
      <td role="cell" className="p2-reach" data-label={label("reached")}>
        {reachedWord(finding)}
      </td>
      <td role="cell" className="num p2-sig" data-label={label("signals")}>
        <Signals finding={finding} />
      </td>
      {showData && (
        <td role="cell" className="num p2-data" data-label={label("data")}>
          {dataAsOf(finding)}
        </td>
      )}
    </tr>
  );
}

/** The codes the rows carry, with their names: a popover the keyboard reaches from the head. */
function SignalKey({ rows }: { rows: readonly Finding[] }) {
  const id = `${useId()}-signals`;
  const key = signalKey(rows);
  if (key.length === 0) return null;
  return (
    <>
      <button type="button" className="p2-key-btn" popovertarget={id} aria-label="What the signal codes mean">
        ?
      </button>
      <div id={id} popover="auto" className="p2-key-pop">
        <p className="p2-key-title">Signal codes in this table</p>
        <dl className="p2-key-list">
          {key.map((entry) => (
            <div key={entry.id}>
              <dt className="mono">{entry.id}</dt>
              <dd>{entry.name}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

/** The All packages tab of a report-2 document (SPEC §7.9.6). Sorted by the head's column, ties and
 *  the default in `rank` order. The wrap scrolls only for names longer than any fixture's; while it
 *  does, it is a named, focusable region (WCAG 2.1.1). */
export function PackagesView2() {
  const { state, dispatch } = useReport();
  const { report } = useReport2();
  const printed = usePrinted();
  const wrap = useRef<HTMLDivElement>(null);
  const scrolls = useOverflowX(wrap);
  const rows = applyFilters2(report, state, "packages");
  const showData = showsDataColumn(report);
  const caption = dataCaption(report);
  const columns = PACKAGES_COLUMNS.filter((column) => showData || column.key !== "data");
  const hideAccepted = state.filters.accepted.includes(HIDE_ACCEPTED);
  const hintId = `${useId()}-hint`;
  if (rows.length === 0) {
    return (
      <section className="p2" data-surface="packages">
        <EmptyState reason={population2(report, "packages").length === 0 ? "clean" : "filtered"} />
      </section>
    );
  }
  return (
    <section className="p2" data-surface="packages">
      {caption !== null && <p className="p2-caption">{caption}</p>}
      <RowHint id={hintId} />
      <p className="p2-sortby" aria-hidden="true">
        Sort by
      </p>
      <div
        ref={wrap}
        className="tablewrap p2-wrap"
        {...(scrolls
          ? { tabIndex: 0, role: "region", "aria-label": "All packages table, scrolls sideways" }
          : {})}
      >
        <table
          className={showData ? "p2-table has-data" : "p2-table"}
          role="table"
          aria-label="All packages"
          aria-describedby={hintId}
        >
          <thead role="rowgroup">
            <tr role="row">
              {columns.map((column) => {
                const active = column.key === state.sort;
                const arrow = active ? (state.sortDesc ? " ↓" : " ↑") : "";
                return (
                  <th
                    key={column.key}
                    role="columnheader"
                    className={`p2-h-${column.key}`}
                    aria-sort={active ? (state.sortDesc ? "descending" : "ascending") : "none"}
                  >
                    {printed ? (
                      <>
                        {column.label}
                        <span aria-hidden="true">{arrow}</span>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={active ? "sort-btn active" : "sort-btn"}
                        onClick={() => {
                          dispatch({ type: "sort", key: column.key });
                        }}
                      >
                        {column.label}
                        <span aria-hidden="true">{arrow}</span>
                      </button>
                    )}
                    {column.key === "signals" && !printed && <SignalKey rows={rows} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((finding) => (
              <PackageRow
                key={finding.package}
                finding={finding}
                report={report}
                hideAccepted={hideAccepted}
                showData={showData}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
