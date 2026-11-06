import { EMPTY_WORDS } from "../../domain/list";
import { useReport } from "../context";
import "./views.css";

/**
 * The shapes a tab's row list can be empty in (DESIGN.md §5 M20). Only a filtered list offers
 * Clear filters, because a clean report has nothing filtered out.
 *
 * - `"clean"`: the view's own population (before any query or rail filter) is empty. Nothing for the
 *   reader to clear.
 * - `"emptyLock"`: All packages of a lock with no package; that tab lists packages, not flags.
 * - `"filtered"`: the population has rows, but the query box or the rail narrowed them to none. A
 *   Clear-filters action makes sense here, so it is offered.
 */
export function EmptyState({ reason }: { reason: "clean" | "emptyLock" | "filtered" }) {
  const { dispatch } = useReport();

  if (reason === "clean") {
    return <p className="empty">{EMPTY_WORDS.clean}</p>;
  }
  if (reason === "emptyLock") {
    return <p className="empty">{EMPTY_WORDS.emptyLock}</p>;
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
