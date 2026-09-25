import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";
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

/** Room kept clear at an overflowing edge — the chevron button (28px, `app.css` `.tabs-scroll`) and
 *  a little of the fade beside it — so a tab brought into view never lands under either. The same
 *  figure as `.tabs`' own `scroll-padding-inline`, which does the job for a keyboard focus move. */
const EDGE_CLEARANCE = 40;
/** How much of the strip's visible width one chevron click moves it by: most of a screen, keeping a
 *  tab of the old view in sight as the reader's anchor. */
const PAGE_FRACTION = 0.7;
/** Sub-pixel scroll positions (zoom, fractional widths) must not read as "more to scroll to". */
const EDGE_EPSILON = 1;

function scrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}

interface Overflow {
  readonly prev: boolean;
  readonly next: boolean;
}

const NO_OVERFLOW: Overflow = { prev: false, next: false };

function overflowOf(el: HTMLElement): Overflow {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= EDGE_EPSILON) return NO_OVERFLOW;
  return { prev: el.scrollLeft > EDGE_EPSILON, next: el.scrollLeft < max - EDGE_EPSILON };
}

/**
 * Which ends of the strip have tabs scrolled out of sight, kept current as the strip scrolls or
 * changes width (PD-TABS-1). Both false wherever the five tabs fit — every width from 768px up with
 * the real fixtures — so nothing is drawn there at all.
 */
function useOverflow(scroller: RefObject<HTMLElement>): Overflow {
  const [overflow, setOverflow] = useState<Overflow>(NO_OVERFLOW);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const update = () => {
      const next = overflowOf(el);
      setOverflow((prev) => (prev.prev === next.prev && prev.next === next.next ? prev : next));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [scroller]);

  return overflow;
}

/** The scroll position that shows all of `tab` inside `scroller`, clear of both edges' chevrons —
 *  or null when it is already in full view. Horizontal only: `scrollIntoView` would also move the
 *  page, which a `hashchange` restore must not do (tabs-and-counts.spec.ts). */
function revealLeft(scroller: HTMLElement, tab: HTMLElement): number | null {
  const box = scroller.getBoundingClientRect();
  const rect = tab.getBoundingClientRect();
  const start = rect.left - box.left + scroller.scrollLeft;
  const end = start + rect.width;
  const view = scroller.clientWidth;
  if (start - EDGE_CLEARANCE < scroller.scrollLeft) return Math.max(0, start - EDGE_CLEARANCE);
  if (end + EDGE_CLEARANCE > scroller.scrollLeft + view) return end + EDGE_CLEARANCE - view;
  return null;
}

/** A chevron drawn in `currentColor`, so forced-colours mode repaints it with the button's text. */
function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg
      className="tabs-scroll-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={dir === "prev" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/**
 * The view switcher, as an ARIA tab list: one tab in the Tab order (the selected one), arrows move
 * between tabs and select as they go. A switch closes the open detail (the reducer's `view`
 * action, legacy report.js:951).
 *
 * PD-TABS-1: where the five tabs do not fit (a phone: 582px of tabs in a 390px screen), the strip
 * scrolls sideways; the side with tabs out of sight fades out under a small chevron button that
 * scrolls it, and the selected tab is scrolled into full view on load and on every switch. The
 * chevrons are pointer affordances only — `tabIndex=-1` and hidden from assistive tech — since the
 * tab list's own single Tab stop and ArrowLeft/ArrowRight already reach every tab, and focusing a
 * tab scrolls it into view by itself.
 */
export function Tabs({ idBase, panelId }: { idBase: string; panelId: string }) {
  const { model, state, dispatch } = useReport();
  const counts = useMemo(() => tabCounts(model), [model]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const scroller = useRef<HTMLElement>(null);
  const overflow = useOverflow(scroller);
  const firstReveal = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current;
    const index = TABS.findIndex((tab) => tab.view === state.view);
    const tab = index === -1 ? null : buttons.current[index];
    if (!el || !tab) return;
    const left = revealLeft(el, tab);
    // The first reveal is where the page opens (a shared `view=` link): no glide to watch.
    const behavior = firstReveal.current ? "auto" : scrollBehavior();
    firstReveal.current = false;
    if (left !== null) el.scrollTo({ left, behavior });
  }, [state.view]);

  const page = useCallback((dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * PAGE_FRACTION), behavior: scrollBehavior() });
  }, []);

  // Keep a keyboard reader's focus where it was: a chevron is a pointer affordance only.
  const keepFocus = (event: MouseEvent) => {
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next = stepTab(event.key, index);
    const tab = next === null ? undefined : TABS[next];
    if (next === null || tab === undefined) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    dispatch({ type: "view", view: tab.view });
  };

  const stripClass = ["tabs-strip", overflow.prev ? "can-prev" : "", overflow.next ? "can-next" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={stripClass}>
      <nav ref={scroller} className="tabs" role="tablist" aria-label="Report views">
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
      <button
        type="button"
        className="tabs-scroll tabs-scroll-prev"
        tabIndex={-1}
        aria-hidden="true"
        title="Scroll tabs left"
        hidden={!overflow.prev}
        onMouseDown={keepFocus}
        onClick={() => {
          page(-1);
        }}
      >
        <Chevron dir="prev" />
      </button>
      <button
        type="button"
        className="tabs-scroll tabs-scroll-next"
        tabIndex={-1}
        aria-hidden="true"
        title="Scroll tabs right"
        hidden={!overflow.next}
        onMouseDown={keepFocus}
        onClick={() => {
          page(1);
        }}
      >
        <Chevron dir="next" />
      </button>
    </div>
  );
}
