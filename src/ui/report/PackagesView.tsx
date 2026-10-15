import { useRef } from "preact/hooks";
import type { Finding, Run } from "../../model/report";
import { applyFilters2, HIDE_ACCEPTED, population2 } from "../../domain/list";
import { gradeTone, shownPills } from "../../domain/findingRow";
import {
  dataAsOf,
  installedAge,
  libyearsCell,
  PACKAGES_COLUMNS,
  reachedWord,
  signalIds,
  type Cell,
} from "../../domain/packageCells";
import { useReport } from "../context";
import { useOverflowX } from "../useOverflowX";
import { toneClass } from "../common/common";
import { rowTabIndex } from "../rowCursor";
import { openInteractions } from "../rowOpen";
import { EmptyState } from "../views/EmptyState";
import { FlagPills } from "./FlagPills";
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
    <>
      {name.slice(0, slash + 1)}
      <wbr />
      <span className="p2-unit">{name.slice(slash + 1)}</span>
    </>
  );
}

function PackageRow({ finding, run, hideAccepted }: { finding: Finding; run: Run; hideAccepted: boolean }) {
  const { state, dispatch, cursor } = useReport();
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
      <td role="cell" className="num p2-ver">
        {finding.version}
      </td>
      <td role="cell" className="num p2-ly">
        <Measured cell={libyearsCell(finding)} />
      </td>
      <td role="cell" className="p2-age">
        <Measured cell={installedAge(finding)} />
      </td>
      <td role="cell" className="p2-verdict">
        {finding.verdict}
      </td>
      <td role="cell" className="num p2-score">
        {finding.score.total}
      </td>
      <td role="cell" className="p2-flags">
        {shownPills(finding, run, hideAccepted).length === 0 ? (
          "—"
        ) : (
          <FlagPills finding={finding} run={run} hideAccepted={hideAccepted} />
        )}
      </td>
      <td role="cell" className="p2-reach">
        {reachedWord(finding)}
      </td>
      <td role="cell" className="num p2-sig">
        {signalIds(finding)}
      </td>
      <td role="cell" className="num p2-data">
        {dataAsOf(finding)}
      </td>
    </tr>
  );
}

/** The All packages tab of a report-2 document (SPEC §7.9.6). Sorted by the head's column, ties and
 *  the default in `rank` order. The wrap scrolls only for names longer than any fixture's; while it
 *  does, it is a named, focusable region (WCAG 2.1.1). */
export function PackagesView2() {
  const { state, dispatch } = useReport();
  const { report } = useReport2();
  const wrap = useRef<HTMLDivElement>(null);
  const scrolls = useOverflowX(wrap);
  const rows = applyFilters2(report, state, "packages");
  const hideAccepted = state.filters.accepted.includes(HIDE_ACCEPTED);
  if (rows.length === 0) {
    return (
      <section className="p2" data-surface="packages">
        <EmptyState reason={population2(report, "packages").length === 0 ? "clean" : "filtered"} />
      </section>
    );
  }
  return (
    <section className="p2" data-surface="packages">
      <div
        ref={wrap}
        className="tablewrap p2-wrap"
        {...(scrolls
          ? { tabIndex: 0, role: "region", "aria-label": "All packages table, scrolls sideways" }
          : {})}
      >
        <table className="p2-table" role="table" aria-label="All packages">
          <thead role="rowgroup">
            <tr role="row">
              {PACKAGES_COLUMNS.map((column) => {
                const active = column.key === state.sort;
                const arrow = active ? (state.sortDesc ? " ↓" : " ↑") : "";
                return (
                  <th
                    key={column.key}
                    role="columnheader"
                    className={`p2-h-${column.key}`}
                    aria-sort={active ? (state.sortDesc ? "descending" : "ascending") : "none"}
                  >
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
                run={report.run}
                hideAccepted={hideAccepted}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
