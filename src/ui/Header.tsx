import type { ComponentChildren, RefObject } from "preact";
import { useId, useLayoutEffect } from "preact/hooks";
import { gateFact, gateHeadline } from "../domain/gate";
import { projectName } from "../domain/pageTitle";
import { day } from "../domain/format";
import { AGES_AS_OF, DATA_AND_AGES_AS_OF, dataDay } from "../domain/share";
import { newTab } from "../domain/rich";
import { GateHeadlineText } from "./common/GateWords";
import { useReport } from "./context";
import { CopySummary } from "./CopySummary";
import { useMeasuredHeight } from "./useMeasuredHeight";
import { themeButtonLabel, type Theme } from "./useTheme";

/** Hides the gate fact's flags from sight only where the summary names them anyway and that saves a
 *  line (gate.css). The flags are the gate's source, so a gate that fails keeps them in the header. */
function fitGateFact(node: HTMLElement): void {
  delete node.dataset["fact"];
  if (node.querySelector(".gate-fact[data-said] .gate-fact-more") === null) return;
  const full = node.getBoundingClientRect().height;
  node.dataset["fact"] = "short";
  if (node.getBoundingClientRect().height >= full) delete node.dataset["fact"];
}

function useGateFactFit(ref: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return undefined;
    let width = window.innerWidth;
    fitGateFact(node);
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      fitGateFact(node);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [ref]);
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

function HeaderDates({ dataDate, generatedAt }: { dataDate: string | null; generatedAt: string }) {
  const ages = <b className="mono">{day(generatedAt)}</b>;
  if (dataDate === null)
    return (
      <span>
        {AGES_AS_OF} {ages}
      </span>
    );
  if (dataDay(dataDate) === day(generatedAt))
    return (
      <span title={`${DATA_AND_AGES_AS_OF} ${day(generatedAt)}`}>
        <span className="vh">data and ages </span>as of {ages}
      </span>
    );
  return (
    <span>
      data <b className="mono">{dataDay(dataDate)}</b> · ages {ages}
    </span>
  );
}

/** The top band: what was checked, against which PHP, as of when, by which lockrot, and the two
 *  page-wide controls. */
export function Header({ theme, onToggleTheme, onOpenGlossary, children, inert = false }: HeaderProps) {
  const { model } = useReport();
  const { run, lockrot, data_date, generated_at } = model.report;
  const ref = useMeasuredHeight<HTMLElement>("--topbar-h");
  useGateFactFit(ref);
  // The project names itself; the lock is called composer.lock everywhere, so it is the fallback.
  const project = projectName(run);
  const label = themeButtonLabel(theme);
  const decided = gateHeadline(model.report);
  const gate = gateFact(model.report);
  const popoverId = `${useId()}-gate`;

  return (
    <header className="topbar" ref={ref} inert={inert}>
      <div className="topbar-in">
        <div className="brand">
          <span className="dot" aria-hidden="true" />
          <a
            className="brand-name"
            href="https://lockrot.dev/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={newTab("lockrot")}
          >
            lockrot
          </a>
          {/* The label keeps the name out of the eyebrow's CSS capitals, which Chromium reads out. */}
          <h1 className="eyebrow project" aria-label={project}>
            {project}
          </h1>
        </div>
        <div className="run-meta">
          <span>
            target PHP <b className="mono">{run.target_php}</b>
          </span>
          <HeaderDates dataDate={data_date} generatedAt={generated_at} />
          <span>
            lockrot <b className="mono">{lockrot.version}</b>
          </span>
          {decided !== null && <GateHeadlineText words={decided} />}
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
