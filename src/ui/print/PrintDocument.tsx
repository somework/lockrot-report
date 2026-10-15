import type { ComponentChildren } from "preact";
import { FOLD_SINGLES } from "../../domain/radius";
import { printSections, type PrintSection } from "../../domain/share";
import type { View } from "../../model/types";
import { EMPTY_FILTERS, INITIAL_STATE } from "../../state/types";
import { ReportContext, type ReportContextValue } from "../context";
import { TABS } from "../Tabs";
import { printHasBody2, printLede2 } from "../../domain/print";
import { AdvisoriesView2 } from "../report/AdvisoriesView";
import { FindingsView2 } from "../report/FindingsView";
import { OverviewView2 } from "../report/OverviewView";
import { PackagesView2 } from "../report/PackagesView";
import { RadiusView2 } from "../report/RadiusView";
import { RunView2 } from "../report/RunView";
import { PrintContext } from "./printContext";

const NOOP = (): void => undefined;

/** The section names the print uses, which are the tabs' own words — a reader who printed from the
 *  screen finds the same headings on paper. The summary is the Overview tab's content. */
const TITLES: Readonly<Record<PrintSection, string>> = {
  summary: "Summary",
  findings: "Findings",
  advisories: "Advisories",
  radius: "Blast radius",
  run: "Run data",
  packages: "All packages",
};

function tabLabel(view: View): string {
  return TABS.find((tab) => tab.view === view)?.label ?? view;
}

/**
 * The page's own context, re-scoped for one printed section: that section's view, no filter, no
 * query, no open package, nothing to dispatch to. Only the All packages table keeps the reader's
 * sort — it is printed because the reader was looking at it, in the order they had it. Blast
 * radius prints its top: the one-each rows' fold stays shut, its head a one-line count.
 */
function sectionValue(base: ReportContextValue, view: View): ReportContextValue {
  return {
    ...base,
    state: {
      ...INITIAL_STATE,
      view,
      filters: EMPTY_FILTERS,
      sort: base.state.sort,
      sortDesc: base.state.sortDesc,
      disclosure: view === "radius" ? { [FOLD_SINGLES]: false } : {},
    },
    dispatch: NOOP,
    cursor: null,
    wide: false,
    openGlossary: NOOP,
  };
}

/** Whether the reader had narrowed anything on screen: the print says it did not follow them. */
function screenNarrowed(base: ReportContextValue): boolean {
  const { filters, q } = base.state;
  return q.trim() !== "" || Object.values(filters).some((keys) => keys.length > 0);
}

interface SectionProps {
  readonly index: number;
  readonly section: PrintSection;
  readonly lede: ComponentChildren;
  /** Whether anything prints under the lede. When nothing does, the lede is the section's last line
   *  and must not hold on to the next section's heading: a chain of "keep with next" from one
   *  section into the next pushed both onto a fresh page. */
  readonly more: boolean;
  readonly children: ComponentChildren;
}

function Section({ index, section, lede, more, children }: SectionProps) {
  return (
    <section className={`pd-sect pd-${section}`}>
      <header className="pd-head">
        <h2 className="pd-title">
          <span className="pd-num">{index}</span>
          {TITLES[section]}
        </h2>
      </header>
      {lede !== null && <p className={more ? "pd-lede is-lead" : "pd-lede"}>{lede}</p>}
      {children}
    </section>
  );
}

function SectionBody({ section }: { section: PrintSection }) {
  switch (section) {
    case "summary":
      return <OverviewView2 />;
    case "findings":
      return <FindingsView2 />;
    case "advisories":
      return <AdvisoriesView2 />;
    case "radius":
      return <RadiusView2 />;
    case "run":
      return (
        <div className="pd-run">
          <RunView2 />
        </div>
      );
    case "packages":
      return <PackagesView2 />;
  }
}

const SECTION_VIEW: Readonly<Record<PrintSection, View>> = {
  summary: "overview",
  findings: "findings",
  advisories: "advisories",
  radius: "radius",
  run: "run",
  packages: "packages",
};

/**
 * The printed report (print.css, `usePrintDocument`): one document in sections whatever tab was
 * open — the summary (Overview's content), Findings, Advisories in full, the top of Blast radius, the run's facts,
 * and All packages only when the reader printed from that tab. Mounted only while the page prints,
 * in place of `<main>`, which the print stylesheet hides while this holds anything; the screen's
 * own state (tab, filters, scroll, open package) is left exactly as it was.
 */
export function PrintDocument({ base }: { base: ReportContextValue }) {
  const { state, model } = base;
  const sections = printSections(state.view);
  const packages = sections.includes("packages");
  // An empty lock has no packages to leave out.
  const any = model.report.findings.length > 0;
  const note = [
    ...(screenNarrowed(base)
      ? ["The filters and search on screen do not apply: every section is printed in full."]
      : []),
    ...(packages
      ? ["All packages is included because the page was open on it."]
      : any
        ? ["All packages is left out; print from that tab to include it."]
        : []),
  ].join(" ");

  return (
    <PrintContext.Provider value={true}>
      <div className="pd">
        <p className="pd-intro">
          <span className="pd-intro-lead">
            Printed from the <b>{tabLabel(state.view)}</b> tab.
          </span>{" "}
          {sections.map((s, i) => (
            <span key={s} className="pd-toc-item">
              <span className="pd-toc-num">{i + 1}</span> {TITLES[s]}
              {s === "radius" ? " (top)" : ""}
            </span>
          ))}
        </p>
        {note !== "" && <p className="pd-intro-note">{note}</p>}
        {sections.map((section, i) => (
          <ReportContext.Provider key={section} value={sectionValue(base, SECTION_VIEW[section])}>
            <Section
              index={i + 1}
              section={section}
              lede={printLede2(section, model.report)}
              more={printHasBody2(section, model.report)}
            >
              <SectionBody section={section} />
            </Section>
          </ReportContext.Provider>
        ))}
      </div>
    </PrintContext.Provider>
  );
}
