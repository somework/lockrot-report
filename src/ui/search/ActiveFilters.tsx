import type { RefObject } from "preact";
import { useId, useLayoutEffect, useRef } from "preact/hooks";
import { activeFilters } from "../../domain/filters";
import { useReport } from "../context";
import "./search.css";

/** One removable filter: its kind in muted words, its value, and a cross. */
interface Chip {
  readonly id: string;
  readonly groupLabel: string;
  readonly label: string;
  readonly remove: () => void;
}

/**
 * The active-filters line under the count (PD-RAIL-4, DESIGN.md §5): every selection narrowing the
 * list — the rail's rows, the ledger's verdict, priority and severity chips, the search box's text
 * — as a chip that removes just that one. The count line above still says "2 filters on" in its
 * live region; this says which, and gives each its own way off, where the only way used to be the
 * search box's Clear, which dropped them all at once.
 *
 * Removing a chip unmounts the button that had focus; focus moves to the chip that took its place
 * (or the one before, for the last), and to the search box once none is left, rather than falling
 * to `<body>`.
 */
export function ActiveFilters({ inputRef }: { inputRef: RefObject<HTMLInputElement> }) {
  const { state, dispatch } = useReport();
  const listRef = useRef<HTMLDivElement>(null);
  const refocus = useRef<number | null>(null);
  const leadId = useId();

  const chips: Chip[] = activeFilters(state.filters).map((filter) => ({
    id: `${filter.group}:${filter.key}`,
    groupLabel: filter.groupLabel,
    label: filter.label,
    remove: () => {
      dispatch({ type: "toggle", group: filter.group, key: filter.key });
    },
  }));
  const q = state.q.trim();
  if (q !== "") {
    chips.push({
      id: "q",
      groupLabel: "Search",
      label: `“${q}”`,
      remove: () => {
        dispatch({ type: "query", q: "" });
      },
    });
  }

  useLayoutEffect(() => {
    const at = refocus.current;
    if (at === null) return;
    refocus.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button.af-chip") ?? [];
    const next = buttons[Math.min(at, buttons.length - 1)];
    if (next) next.focus();
    else inputRef.current?.focus();
  });

  if (chips.length === 0) return null;

  return (
    <div className="af">
      <span className="af-lead" id={leadId}>
        Filtered by
      </span>
      <div className="af-list" role="group" aria-labelledby={leadId} ref={listRef}>
        {chips.map((chip, index) => (
          <button
            key={chip.id}
            type="button"
            className="af-chip"
            aria-label={`Remove filter: ${chip.groupLabel} ${chip.label}`}
            title={`Remove this filter: ${chip.groupLabel} ${chip.label}`}
            onClick={() => {
              refocus.current = index;
              chip.remove();
            }}
          >
            <span className="af-group">{chip.groupLabel}</span> <span className="af-value">{chip.label}</span>
            <span className="af-x" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
