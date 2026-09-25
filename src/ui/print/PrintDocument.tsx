import type { ComponentChildren } from "preact";
import { population } from "../../domain/filters";
import { plural } from "../../domain/format";
import { advisoryCheckIncomplete, allAdvisories } from "../../domain/advisories";
import { FOLD_SINGLES } from "../../domain/radius";
import { printSections, sharedDataDay, type PrintSection } from "../../domain/share";
import type { View } from "../../model/types";
import { EMPTY_FILTERS, INITIAL_STATE } from "../../state/types";
import { ReportContext, type ReportContextValue } from "../context";
import { Ledger } from "../ledger/Ledger";
import { TABS } from "../Tabs";
import { AdvisoriesView } from "../views/AdvisoriesView";
import { FindingsView } from "../views/FindingsView";
import { PackagesView } from "../views/PackagesView";
import { RadiusView } from "../views/RadiusView";
import { RunView } from "../views/RunView";
import { PrintContext } from "./printContext";

const NOOP = (): void => undefined;

/** The section names the print uses, which are the tabs' own words — a reader who printed from the
 *  screen finds the same headings on paper. The summary band has no tab. */
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
    openGlossaryFrom: NOOP,
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

/** Packages the run checked: `packagesChecked`, else the findings' count. */
function lockSize(base: ReportContextValue): number {
  const { report } = base.model;
  return report.packagesChecked ?? report.findings.length;
}

/** Whether a section prints anything under its lede: an empty Findings or Advisories tab's own
 *  empty state is hidden on paper, where its lede already says so. */
function hasBody(section: PrintSection, base: ReportContextValue): boolean {
  const { model } = base;
  if (section === "summary") return lockSize(base) > 0;
  if (section === "findings") return population(model, "findings").length > 0;
  if (section === "advisories") return allAdvisories(model).length > 0;
  return true;
}

/** Each section's one line under its heading: what it holds, counted, and what the print leaves
 *  out of it. Counts only, the same ones the tabs show. */
function lede(section: PrintSection, base: ReportContextValue): ComponentChildren {
  const { model } = base;
  switch (section) {
    case "summary":
      // An empty lock's band is three empty tiers; on paper its one line says it all.
      return lockSize(base) === 0 ? "No packages in this lock." : null;
    case "findings": {
      const n = population(model, "findings").length;
      const checked = lockSize(base);
      return n === 0 ? (
        <>
          {checked === 0
            ? "No packages in this lock."
            : `Nothing flagged in ${plural(checked, "package", "packages")}.`}
        </>
      ) : (
        <>
          <b>{n}</b> flagged {n === 1 ? "package" : "packages"}, most urgent first, each with every signal it
          fired.
        </>
      );
    }
    case "advisories": {
      const n = allAdvisories(model).length;
      if (n > 0) {
        return (
          <>
            All <b>{n}</b> {n === 1 ? "advisory" : "advisories"}, grouped by what the fix takes.
          </>
        );
      }
      return advisoryCheckIncomplete(model) ? (
        <>No advisory found, but the advisory check was incomplete; the run's notes under Run data say why.</>
      ) : (
        <>No advisory affects this lock.</>
      );
    }
    case "radius":
      // With nothing flagged the tab's own one line says so; there is no top to describe.
      return population(model, "findings").length === 0 ? null : (
        <>The ranked rows from the top of the tab; the folded groups under them print as their counts.</>
      );
    case "run":
      return null;
    case "packages": {
      const all = population(model, "packages");
      const shared = sharedDataDay(all);
      const zeroes = all.some((f) => f.libyears === 0);
      return (
        <>
          Printed because the page was open on All packages:{" "}
          <b>{plural(all.length, "package", "packages")}</b>, in the order the table had them.
          {shared !== null && <> Every package's data is as of {shared}.</>}
          {zeroes && (
            <> A libyears of 0.0 marked “newest” is an installed release that is the newest stable.</>
          )}
        </>
      );
    }
  }
}

function SectionBody({ section, base }: { section: PrintSection; base: ReportContextValue }) {
  switch (section) {
    case "summary":
      return lockSize(base) === 0 ? null : <Ledger />;
    case "findings":
      return <FindingsView />;
    case "advisories":
      return <AdvisoriesView />;
    case "radius":
      return <RadiusView />;
    case "run":
      return (
        <div className="pd-run">
          <RunView />
        </div>
      );
    case "packages":
      return <PackagesView />;
  }
}

const SECTION_VIEW: Readonly<Record<PrintSection, View>> = {
  summary: "findings",
  findings: "findings",
  advisories: "advisories",
  radius: "radius",
  run: "run",
  packages: "packages",
};

/**
 * The printed report (print.css, `usePrintDocument`): one document in sections whatever tab was
 * open — the summary band, Findings, Advisories in full, the top of Blast radius, the run's facts,
 * and All packages only when the reader printed from that tab. Mounted only while the page prints,
 * in place of `<main>`, which the print stylesheet hides while this holds anything; the screen's
 * own state (tab, filters, scroll, open package) is left exactly as it was.
 */
export function PrintDocument({ base }: { base: ReportContextValue }) {
  const { state, model } = base;
  const sections = printSections(state.view);
  const packages = sections.includes("packages");
  // An empty lock has no packages to leave out.
  const any = population(model, "packages").length > 0;
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
            <Section index={i + 1} section={section} lede={lede(section, base)} more={hasBody(section, base)}>
              <SectionBody section={section} base={base} />
            </Section>
          </ReportContext.Provider>
        ))}
      </div>
    </PrintContext.Provider>
  );
}
