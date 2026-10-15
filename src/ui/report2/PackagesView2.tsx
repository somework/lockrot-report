import { applyFilters2, population2 } from "../../domain/list2";
import { useReport } from "../context";
import { rowTabIndex } from "../rowCursor";
import { openInteractions } from "../views/FindingRow";
import { EmptyState } from "../views/EmptyState";
import { useReport2 } from "./useReport2";
import "./packages2.css";

/** The All packages tab of a report-2 document (SPEC §7.9.6). */
export function PackagesView2() {
  const { state, dispatch, cursor } = useReport();
  const { report } = useReport2();
  const rows = applyFilters2(report, state, "packages");
  return (
    <section className="p2" data-surface="packages">
      {rows.length === 0 ? (
        <EmptyState reason={population2(report, "packages").length === 0 ? "clean" : "filtered"} />
      ) : (
        <ul className="p2-rows" aria-label="All packages">
          {rows.map((finding) => (
            <li
              key={finding.package}
              className="p2-row"
              data-pkg={finding.package}
              aria-label={finding.package}
              aria-current={state.pkg === finding.package ? "true" : undefined}
              tabIndex={rowTabIndex(finding.package, cursor)}
              {...openInteractions(finding.package, dispatch)}
            >
              <span className="p2-name">{finding.package}</span>{" "}
              <span className="p2-version">{finding.version}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
