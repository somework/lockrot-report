import { useRef } from "preact/hooks";
import { hiddenByFilters2 } from "../../domain/list2";
import { useReport } from "../context";
import { useReport2 } from "./useReport2";
import "./detail2.css";

/** The detail sheet of a report-2 document (SPEC §7.9.8). An unknown `pkg=` gets a panel that says
 *  so, with the same Close. */
export function Detail2({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useReport();
  const { report } = useReport2();
  // `dispatch` unmounts the Clear-filters button, so focus goes to Close, which every state keeps.
  const closeRef = useRef<HTMLButtonElement>(null);
  if (state.pkg === null) return null;

  const finding = report.findings.find((f) => f.package === state.pkg);
  if (finding === undefined) {
    return (
      <aside className="detail d2" role="complementary" aria-label={state.pkg} data-surface="detail">
        <p className="detail-missing">{state.pkg} is not in this report.</p>
        <button type="button" className="detail-close" onClick={onClose} data-detail-focus="">
          Close
        </button>
      </aside>
    );
  }

  return (
    <aside className="detail d2" role="complementary" aria-label={finding.package} data-surface="detail">
      <div className="d2-head">
        <h2 className="detail-title" tabIndex={-1} data-detail-focus="">
          {finding.package}
        </h2>
        <span className="detail-version">{finding.version}</span>
        <button type="button" ref={closeRef} className="detail-close" onClick={onClose}>
          Close
        </button>
      </div>
      {hiddenByFilters2(report, state, finding.package) && (
        <p className="detail-hidden-note">
          Hidden by the current filters.
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              dispatch({ type: "clear" });
              closeRef.current?.focus();
            }}
          >
            Clear filters
          </button>
        </p>
      )}
    </aside>
  );
}
