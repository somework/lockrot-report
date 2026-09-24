import type { ComponentChildren } from "preact";
import { useId, useLayoutEffect, useRef } from "preact/hooks";
import { day } from "../domain/format";
import { useReport } from "./context";
import { themeButtonLabel, type Theme } from "./useTheme";

/** The gate fact's two states the run can actually be in, plus its text — kept together so the
 *  button and its popover can never drift out of sync (DESIGN.md §8, "a quiet fact in the
 *  header"). `run.failOn === null` (a document older than the field) renders neither: the page
 *  must not claim a run said "no gate" when it never said anything about one at all.
 *
 *  regression review: the earlier text stated what `--fail-on` does at the CLI (exit codes) and
 *  recommended setting it in CI — both beyond what this page can derive from the document in front
 *  of it (the hard rule: observations with evidence, no advice). It now says only what the run was
 *  given, plus that the page does not know whether the gate fired. */
function gateFact(failOn: string): { label: string; text: string } {
  if (failOn === "none") {
    return {
      label: "no gate",
      text: "This run was given --fail-on=none.",
    };
  }

  return {
    label: `gate: ${failOn}`,
    text: `This run was given --fail-on=${failOn}. The page does not record whether the gate fired.`,
  };
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
}

/**
 * The top band: what was checked, against which PHP, as of when, by which lockrot, and the two
 * page-wide controls (legacy report.html:26-42). Every value falls back to an em dash rather than a
 * guess: the page must not name a PHP target the run may not have had.
 */
export function Header({ theme, onToggleTheme, onOpenGlossary, children }: HeaderProps) {
  const { model } = useReport();
  const { run, tool, generatedAt } = model.report;
  const ref = useHeaderHeight();
  // The project names itself; the lock is called composer.lock everywhere, so it is the fallback.
  const project = run.project ?? run.lockFile ?? "composer.lock";
  const label = themeButtonLabel(theme);
  const gate = run.failOn === null ? null : gateFact(run.failOn);
  const popoverId = `${useId()}-gate`;

  return (
    <header className="topbar" ref={ref}>
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
        </div>
      </div>
      {children}
    </header>
  );
}
