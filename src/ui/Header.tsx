import type { ComponentChildren } from "preact";
import { useId, useLayoutEffect, useRef } from "preact/hooks";
import { gateFocus, gateTally, type GateTally } from "../domain/baseline";
import { day, plural } from "../domain/format";
import { useReport } from "./context";
import { CopySummary } from "./CopySummary";
import { themeButtonLabel, type Theme } from "./useTheme";

/** The gate fact's label and popover text, kept together so the two never drift apart (DESIGN.md
 *  §8). `--fail-on`'s effect on the exit code is lockrot's documented CLI contract; the popover still
 *  never says whether this run's gate fired. */
function gateFact(failOn: string, tally: string | null): { label: string; text: string } {
  if (failOn === "none") {
    return {
      label: "no gate",
      text: "No gate on this run: it exits 0 whatever it finds, and this page lists what it saw. Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.",
    };
  }

  // The count sits between the rule and the caveat, so the last word is still what the page cannot know.
  const counted = tally === null ? "" : ` ${tally}`;
  return {
    label: `gate: ${failOn}`,
    text: `This run was told to fail on ${failOn}: it exits 1 when a finding the baseline does not already accept reaches ${failOn}.${counted} The page does not record the run's exit code.`,
  };
}

/** What the tally counts, in the threshold's own terms: `unchecked` is not a level anything is
 *  "above", and a kind this page does not know is only said to be reached. `short` is the header's
 *  form, beside a label that already names the level. */
function reachWords(tally: GateTally, short = false): string {
  if (tally.kind === "unchecked") return short ? "with S10" : "with a check that did not run (S10)";
  if (tally.kind === "priority" || tally.kind === "verdict") {
    return short ? "at or above" : `at or above ${tally.failOn}`;
  }
  return short ? "reach it" : `reaching ${tally.failOn}`;
}

/** The popover's count sentence: the same numbers as the tally beside the button, in words. */
function tallySentence(tally: GateTally, path: string): string {
  const reached = `${plural(tally.reached, "finding", "findings")} in this report ${tally.reached === 1 ? "is" : "are"} ${reachWords(tally)}`;
  if (tally.notAccepted === null) return `${reached}.`;
  return `${reached}; ${tally.notAccepted} of them ${tally.notAccepted === 1 ? "is" : "are"} not already accepted in ${path}.`;
}

/**
 * PD-BASELINE-5 (DESIGN.md §5): beside the gate fact, how many findings reach it — and, with a
 * baseline, how many *of them* the baseline does not exempt. "of them" is the point: the second
 * number is a subset of the first, never the Findings answer's "new" count, which it would otherwise
 * be read as. Both are counted from each finding's own `gate` (`domain/baseline.ts`).
 *
 * PD-BASELINE-6: when the rail's own filters can list exactly that subset (`gateFocus`), the second
 * count is a button that does — Findings, those filters, the list brought into view — so "which
 * ones?" is one press from the header on every tab.
 */
function GateTallyText({ tally }: { tally: GateTally }) {
  const { model, dispatch } = useReport();
  const focus = tally.notAccepted === null || tally.notAccepted === 0 ? null : gateFocus(model);
  const path = model.report.baseline?.path || "the baseline";
  const outside =
    tally.notAccepted === null ? null : (
      <>
        <b className="mono">{tally.notAccepted}</b> of them not accepted
      </>
    );
  return (
    <span className="gate-tally">
      <b className="mono">{tally.reached}</b> {reachWords(tally, true)}
      {outside !== null && (
        <>
          {" · "}
          {focus === null ? (
            outside
          ) : (
            <button
              type="button"
              className="gate-focus"
              title={`List the ${plural(tally.notAccepted ?? 0, "finding", "findings")} ${reachWords(tally)} that ${path} does not already accept`}
              onClick={() => {
                dispatch({ type: "focus", filters: focus });
              }}
            >
              {outside}
            </button>
          )}
        </>
      )}
    </span>
  );
}

/**
 * Publishes the header's rendered height as `--topbar-h`, which the sticky rail and detail column
 * sit under. The legacy page hard-coded 196px (css-html.md §10.4), and a long project name or a
 * wrapped meta line pushed the real header past it. Set through the CSSOM, which the page's CSP
 * allows (DESIGN.md §1.3).
 */
function useHeaderHeight() {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === "undefined") return undefined;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--topbar-h", `${Math.ceil(node.getBoundingClientRect().height)}px`);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      root.style.removeProperty("--topbar-h");
    };
  }, []);

  return ref;
}

export interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenGlossary: () => void;
  /** The tab list, which sits in the header's sticky band. */
  children?: ComponentChildren;
  /** A detail sheet covers the page, header and all, so nothing here can take focus (PD-ROWS-12). */
  inert?: boolean;
}

/**
 * The top band: what was checked, against which PHP, as of when, by which lockrot, and the two
 * page-wide controls (legacy report.html:26-42). Every value falls back to an em dash rather than a
 * guess: the page must not name a PHP target the run may not have had.
 */
export function Header({ theme, onToggleTheme, onOpenGlossary, children, inert = false }: HeaderProps) {
  const { model } = useReport();
  const { run, tool, generatedAt } = model.report;
  const ref = useHeaderHeight();
  // The project names itself; the lock is called composer.lock everywhere, so it is the fallback.
  const project = run.project ?? run.lockFile ?? "composer.lock";
  const label = themeButtonLabel(theme);
  const tally = gateTally(model);
  const counted = tally === null ? null : tallySentence(tally, model.report.baseline?.path || "the baseline");
  const gate = run.failOn === null ? null : gateFact(run.failOn, counted);
  const popoverId = `${useId()}-gate`;

  return (
    <header className="topbar" ref={ref} inert={inert}>
      <div className="topbar-in">
        <div className="brand">
          <span className="dot" aria-hidden="true" />
          <h1>
            <a href="https://lockrot.dev/" target="_blank" rel="noopener noreferrer">
              lockrot
            </a>
          </h1>
          <span className="eyebrow project">{project}</span>
        </div>
        <div className="run-meta">
          <span>
            target PHP <b className="mono">{run.targetPhp ?? "—"}</b>
          </span>
          <span>
            data as of <b className="mono">{day(generatedAt)}</b>
          </span>
          <span>
            lockrot <b className="mono">{tool.version ?? "—"}</b>
          </span>
          {/* A native popover: no application state opens or closes it, so it needs no JS handler
              and nothing the page's CSP would have to allow (DESIGN.md §1.3). `title` repeats the
              same text for an engine without the Popover API. */}
          {gate !== null && (
            <span>
              <button type="button" className="fact-btn" popovertarget={popoverId} title={gate.text}>
                {gate.label}{" "}
                <span className="fact-btn-icon" aria-hidden="true">
                  ⓘ
                </span>
              </button>
              <div id={popoverId} popover="auto" className="fact-pop">
                {gate.text}
              </div>
              {tally !== null && (
                <>
                  {" "}
                  <GateTallyText tally={tally} />
                </>
              )}
            </span>
          )}
          <span className="run-actions">
            <button className="icon-btn glossary-open" type="button" onClick={onOpenGlossary}>
              What these words mean
            </button>
            <button
              className="icon-btn theme-toggle"
              type="button"
              title={`Switch to the ${label.toLowerCase()} theme`}
              onClick={onToggleTheme}
            >
              {label}
            </button>
          </span>
          {/* Print prints the whole report in sections, whatever tab is open (print/PrintDocument.tsx);
              the browser's own Print does the same through the same `beforeprint`. */}
          <span className="run-actions share-actions">
            <button
              className="icon-btn print-btn"
              type="button"
              title="Print the whole report, or save it as a PDF, whatever tab is open"
              onClick={() => {
                window.print();
              }}
            >
              Print / PDF
            </button>
            <CopySummary />
          </span>
        </div>
      </div>
      {children}
    </header>
  );
}
