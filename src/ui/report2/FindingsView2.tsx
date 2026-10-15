import type { Finding } from "../../model/report2";
import { applyFilters2, population2 } from "../../domain/list2";
import { namesCapped } from "../../domain/findingWords";
import { useReport } from "../context";
import { rowTabIndex } from "../rowCursor";
import { openInteractions } from "../views/FindingRow";
import { EmptyState } from "../views/EmptyState";
import { useReport2 } from "./useReport2";
import "./findings2.css";

function reachWord(f: Finding): string {
  const way = f.reach === "transitive" ? `via ${namesCapped(f.direct_dependents)}` : f.reach;
  return f.dev ? `${way} · dev` : way;
}

function FindingRow2({ finding }: { finding: Finding }) {
  const { state, dispatch, cursor } = useReport();
  return (
    <li
      className="f2-row"
      data-pkg={finding.package}
      aria-label={finding.package}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      tabIndex={rowTabIndex(finding.package, cursor)}
      {...openInteractions(finding.package, dispatch)}
    >
      <span className="f2-score">{finding.score.total}</span>
      <span className="f2-name">{finding.package}</span>
      <span className="f2-version">{finding.version}</span>
      <span className="f2-reach">{reachWord(finding)}</span>
    </li>
  );
}

/** The Findings tab of a report-2 document (SPEC §7.9.5). */
export function FindingsView2() {
  const { state } = useReport();
  const { report } = useReport2();
  const rows = applyFilters2(report, state, "findings");
  return (
    <section className="f2" data-surface="findings">
      {rows.length === 0 ? (
        <EmptyState reason={population2(report, "findings").length === 0 ? "clean" : "filtered"} />
      ) : (
        <ul className="f2-rows" aria-label="Findings">
          {rows.map((finding) => (
            <FindingRow2 key={finding.package} finding={finding} />
          ))}
        </ul>
      )}
    </section>
  );
}
