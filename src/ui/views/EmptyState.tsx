import { useReport } from "../context";
import "./views.css";

/**
 * The two shapes a tab's row list can be empty in — DESIGN.md §5 M20. Legacy showed the same
 * "Nothing matches this filter." for both, which reads as a lie on a genuinely clean report (zero
 * flagged packages, zero advisories, an empty lock): nothing was ever filtered out, there was simply
 * nothing to flag. `reason` tells the two apart:
 *
 * - `"clean"`: the view's own population (before any query or rail filter) is empty. Nothing for the
 *   reader to clear.
 * - `"filtered"`: the population has rows, but the query box or the rail narrowed them to none. A
 *   Clear-filters action makes sense here, so it is offered.
 */
export function EmptyState({ reason }: { reason: "clean" | "filtered" }) {
  const { dispatch } = useReport();

  if (reason === "clean") {
    return <p className="empty">Nothing was flagged.</p>;
  }

  return (
    <p className="empty">
      Nothing matches this filter.{" "}
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          dispatch({ type: "clear" });
        }}
      >
        Clear filters
      </button>
    </p>
  );
}
