import type { Finding, Report2, Run } from "../../model/report";
import { applyFilters2, HIDE_ACCEPTED, population2 } from "../../domain/list";
import { ageAxis, type AgeAxis } from "../../domain/age";
import {
  cappedPackages,
  FINDINGS_HEAD,
  gradeListLabel,
  gradeTone,
  ignoredNote,
  packagesCount,
  runNote,
  runSegments,
  uncheckedNote,
  type PackagesNote,
} from "../../domain/findingRow";
import { bandTicks } from "../../domain/scoreBar";
import { gradeChips, OVERVIEW_WORDS } from "../../domain/overviewBand";
import { OVERVIEW_TAB_WORDS, stripFlagged } from "../../domain/overviewTab";
import { verdictTone } from "../../domain/findingRow";
import { useReport } from "../context";
import { LegendButton, toneClass } from "../common/common";
import { EmptyState } from "../views/EmptyState";
import { AgeAxis as AgeAxisHead } from "../views/AgeScale";
import { FindingRow2 } from "./FindingRow";
import { usePrinted } from "../print/printContext";
import { useReport2 } from "./useReport";
import "../views/views.css";
import "../views/ledger-rows.css";
import "./findings.css";

/** `applyFilters2` keeps `rank` order, which runs grade by grade, so a boundary is enough. */
function byGrade(findings: readonly Finding[]): { verdict: string; findings: Finding[] }[] {
  const groups: { verdict: string; findings: Finding[] }[] = [];
  for (const finding of findings) {
    const current = groups.at(-1);
    if (current?.verdict === finding.verdict) current.findings.push(finding);
    else groups.push({ verdict: finding.verdict, findings: [finding] });
  }
  return groups;
}

/** IgnoredNote and UncheckedNote (SPEC §7.9.5): a line each, the first packages one click away. */
function NoteLine({ note }: { note: PackagesNote }) {
  const { dispatch } = useReport();
  const { shown, more } = cappedPackages(note.packages);
  return (
    <p className="note f2-note">
      {note.text}:{" "}
      {shown.map((pkg, i) => (
        <span key={pkg}>
          {i > 0 && ", "}
          <button
            type="button"
            className="pkg-link-btn"
            onClick={() => {
              dispatch({ type: "select", pkg });
            }}
          >
            {pkg}
          </button>
        </span>
      ))}
      {more !== null && ` ${more}`}.
    </p>
  );
}

/** The score scale's floors over the bars, and the age axis; each row says its own parts. */
function ColumnHead({ run, axis }: { run: Run; axis: AgeAxis | null }) {
  return (
    <div className="fhead f2-head">
      <span className="fhead-col f2-head-score" aria-hidden="true">
        <span className="f2-head-label">{FINDINGS_HEAD.score}</span>
        <span className="f2-head-axis">
          <span className="f2-head-tick">0</span>
          {bandTicks(run).map((tick) => (
            <span key={tick.floor} className="f2-head-tick" style={{ left: `${tick.at * 100}%` }}>
              {tick.floor}
            </span>
          ))}
        </span>
      </span>
      <span className="fhead-col f2-head-pkg" aria-hidden="true">
        {FINDINGS_HEAD.pkg}
      </span>
      <span className="fhead-col f2-head-flags" aria-hidden="true">
        {FINDINGS_HEAD.flags}
      </span>
      {axis ? <AgeAxisHead axis={axis} caption={FINDINGS_HEAD.age} /> : <span className="fhead-age" />}
      <span className="fhead-col f2-head-reach" aria-hidden="true">
        {FINDINGS_HEAD.reach}
      </span>
      <span className="fhead-col f2-head-next" aria-hidden="true">
        {FINDINGS_HEAD.next}
      </span>
    </div>
  );
}

/** On paper, over each group: the score floors at the bars' own scale, as the age axis repeats. */
function PrintedScale({ run }: { run: Run }) {
  return (
    <div className="f2-print-scale" aria-hidden="true">
      <span className="f2-print-gap" />
      <span className="f2-print-axis">
        <span className="f2-head-tick">0</span>
        {bandTicks(run).map((tick) => (
          <span key={tick.floor} className="f2-head-tick" style={{ left: `${tick.at * 100}%` }}>
            {tick.floor}
          </span>
        ))}
      </span>
      <span>{FINDINGS_HEAD.score}</span>
    </div>
  );
}

function Group({ verdict, findings, axis }: { verdict: string; findings: Finding[]; axis: AgeAxis | null }) {
  const { state } = useReport();
  const { report } = useReport2();
  const printed = usePrinted();
  const hideAccepted = state.filters.accepted.includes(HIDE_ACCEPTED);
  const rows = (members: readonly Finding[]) =>
    members.map((finding) => (
      <FindingRow2
        key={finding.package}
        finding={finding}
        run={report.run}
        axis={axis}
        hideAccepted={hideAccepted}
      />
    ));
  return (
    // No accessible name: a named <section> is a landmark, and the page's one region is the open
    // package.
    <section className={`fgroup ${toneClass(gradeTone(verdict))}`}>
      <header className="fgroup-head">
        <h2>{verdict}</h2>
        <span className="fgroup-count">{packagesCount(findings.length)}</span>
      </header>
      {printed && <PrintedScale run={report.run} />}
      {runSegments(findings).map((segment) => {
        const first = segment.findings[0]?.package ?? "";
        if (segment.key === null) {
          return (
            <ul key={first} className="frows" aria-label={gradeListLabel(verdict)}>
              {rows(segment.findings)}
            </ul>
          );
        }
        const note = runNote(segment.key, segment.findings.length);
        return (
          <div key={first} className="frun">
            <p className="frun-note">{note}</p>
            <ul className="frows" aria-label={note}>
              {rows(segment.findings)}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function Notes({ report }: { report: Report2 }) {
  const ignored = ignoredNote(report);
  const unchecked = uncheckedNote(report);
  return (
    <>
      {ignored !== null && <NoteLine note={ignored} />}
      {unchecked !== null && <NoteLine note={unchecked} />}
    </>
  );
}

/**
 * One line over the Findings list (PD-SUMMARY-16): the flagged figure, the grade chips, which toggle
 * `verdict` in place, and the way back to Overview, where the summary band lives.
 */
export function FindingsStrip() {
  const { state, dispatch } = useReport();
  const { report } = useReport2();
  if (report.packages_flagged === 0) return null;
  const pressed = state.filters.verdict;

  return (
    <div className="f2-strip">
      <p className="f2-strip-figure">{stripFlagged(report)}</p>
      <div className="legend f2-strip-chips" role="group" aria-label={OVERVIEW_WORDS.grades}>
        {gradeChips(report).map(({ grade, count }) => (
          <LegendButton
            key={grade}
            tone={verdictTone(report.run.score_model, grade)}
            dim={count === 0}
            pressed={pressed.includes(grade)}
            label={grade}
            count={count}
            onToggle={() => {
              dispatch({ type: "toggle", group: "verdict", key: grade });
            }}
          />
        ))}
      </div>
      <a
        className="ov-link f2-strip-back"
        href="#"
        onClick={(event) => {
          event.preventDefault();
          dispatch({ type: "view", view: "overview" });
        }}
      >
        {OVERVIEW_TAB_WORDS.overview} <span aria-hidden="true">›</span>
      </a>
    </div>
  );
}

/** The Findings tab of a report-2 document (SPEC §7.9.5): graded findings by grade, in `rank`
 *  order. */
export function FindingsView2() {
  const { state } = useReport();
  const { report } = useReport2();
  const rows = applyFilters2(report, state, "findings");
  const thresholds = report.run.thresholds;
  const axis = thresholds === null ? null : ageAxis(Object.entries(thresholds));
  return (
    <section className="f2" data-surface="findings">
      <Notes report={report} />
      {rows.length === 0 ? (
        <EmptyState reason={population2(report, "findings").length === 0 ? "clean" : "filtered"} />
      ) : (
        <div className="fledger f2-ledger">
          <ColumnHead run={report.run} axis={axis} />
          {byGrade(rows).map((group) => (
            <Group key={group.verdict} verdict={group.verdict} findings={group.findings} axis={axis} />
          ))}
        </div>
      )}
    </section>
  );
}
