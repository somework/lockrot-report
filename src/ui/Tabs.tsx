import { useMemo, useRef } from "preact/hooks";
import { allAdvisories } from "../domain/advisories";
import { population } from "../domain/filters";
import type { Model, View } from "../model/types";
import { useReport } from "./context";

/** The five views in tab order, with the labels the legacy page shows (report.html:44-48). */
export const TABS: readonly { view: View; label: string }[] = [
  { view: "findings", label: "Findings" },
  { view: "advisories", label: "Advisories" },
  { view: "packages", label: "All packages" },
  { view: "radius", label: "Blast radius" },
  { view: "run", label: "Run data" },
];

/**
 * Each tab's badge: whole-report totals that no filter moves (legacy report.js:860-864, kept on
 * purpose, critic.md M18). Run data counts the run's notes and shows nothing when there are none.
 */
export function tabCounts(model: Model): Readonly<Record<View, string>> {
  const notes = model.report.notes.length;

  return {
    findings: String(population(model, "findings").length),
    advisories: String(allAdvisories(model).length),
    packages: String(model.report.findings.length),
    radius: String(model.report.exposure.length),
    run: notes > 0 ? String(notes) : "",
  };
}

export function tabId(idBase: string, view: View): string {
  return `${idBase}-tab-${view}`;
}

/** Which tab an arrow, Home or End key moves to (the ARIA tabs pattern), or null for other keys. */
function stepTab(key: string, index: number): number | null {
  const last = TABS.length - 1;
  if (key === "ArrowRight") return index === last ? 0 : index + 1;
  if (key === "ArrowLeft") return index === 0 ? last : index - 1;
  if (key === "Home") return 0;
  if (key === "End") return last;

  return null;
}

/**
 * The view switcher, as an ARIA tab list: one tab in the Tab order (the selected one), arrows move
 * between tabs and select as they go. A switch closes the open detail (the reducer's `view`
 * action, legacy report.js:951).
 */
export function Tabs({ idBase, panelId }: { idBase: string; panelId: string }) {
  const { model, state, dispatch } = useReport();
  const counts = useMemo(() => tabCounts(model), [model]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next = stepTab(event.key, index);
    const tab = next === null ? undefined : TABS[next];
    if (next === null || tab === undefined) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    dispatch({ type: "view", view: tab.view });
  };

  return (
    <nav className="tabs" role="tablist" aria-label="Report views">
      {TABS.map(({ view, label }, index) => {
        const selected = state.view === view;
        return (
          <button
            key={view}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            id={tabId(idBase, view)}
            className="tab"
            type="button"
            role="tab"
            aria-selected={selected ? "true" : "false"}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            // Even the current tab dispatches: a click on it closes the open detail, as on the
            // legacy page.
            onClick={() => {
              dispatch({ type: "view", view });
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
          >
            {label}
            <span className="n">{counts[view]}</span>
          </button>
        );
      })}
    </nav>
  );
}
