import type { ComponentChildren } from "preact";
import { useId, useLayoutEffect, useRef } from "preact/hooks";
import { day } from "../domain/format";
import { gateFact, runGate } from "../domain/gate";
import { GateHeadlineText } from "./common/GateWords";
import { useReport } from "./context";
import { CopySummary } from "./CopySummary";
import { themeButtonLabel, type Theme } from "./useTheme";

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
  const decided = runGate(model);
  const gate = decided === null ? gateFact(model) : null;
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
          {decided !== null && <GateHeadlineText gate={decided} />}
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
