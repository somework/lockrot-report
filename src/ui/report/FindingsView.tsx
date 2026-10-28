import type { Finding, Report2, Run } from "../../model/report";
import { applyFilters2, HIDE_ACCEPTED, population2 } from "../../domain/list";
import { ageAxis, type AgeAxis } from "../../domain/age";
import {
  cappedPackages,
  FINDINGS_COLUMNS,
  FINDINGS_HEAD,
  GATE_WORDS,
  gradeListLabel,
  gradeTone,
  ignoredNote,
  packagesCount,
  runNote,
  majorCount,
  majorCountWords,
  runSegments,
  uncheckedNote,
  type PackagesNote,
} from "../../domain/findingRow";
import { bandTicks } from "../../domain/scoreBar";
import { gradeChips, OVERVIEW_WORDS } from "../../domain/overviewBand";
import { OVERVIEW_TAB_WORDS, stripFlagged } from "../../domain/overviewTab";
import { verdictTone } from "../../domain/findingRow";
import type { ComponentChildren } from "preact";
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
import { platformStep } from "../../domain/moveCards";
import { LIST_HEAD_H, useMeasuredHeight } from "../useMeasuredHeight";

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

/** The column heads of the Findings table: the score scale's floors over the bars, and the age
 *  axis. A narrow layout hides them from sight only; each value there carries its own label. */
function ColumnHead({ run, axis, onScreen }: { run: Run; axis: AgeAxis | null; onScreen: boolean }) {
  const ref = useMeasuredHeight<HTMLDivElement>(LIST_HEAD_H);
  return (
    <div className="fhead f2-head" role="row" ref={onScreen ? ref : null}>
      <span className="fhead-col f2-head-score" role="columnheader">
        <span className="f2-head-label">{FINDINGS_HEAD.score}</span>
        <span className="f2-head-axis" aria-hidden="true">
          <span className="f2-head-tick">0</span>
          {bandTicks(run).map((tick) => (
            <span key={tick.floor} className="f2-head-tick" style={{ left: `${tick.at * 100}%` }}>
              {tick.floor}
            </span>
          ))}
        </span>
      </span>
      <span className="fhead-col f2-head-pkg" role="columnheader">
        {FINDINGS_HEAD.pkg}
      </span>
      <span className="fhead-col f2-head-flags" role="columnheader">
        {FINDINGS_HEAD.flags}
      </span>
      {axis ? (
        <AgeAxisHead axis={axis} caption={FINDINGS_HEAD.age} />
      ) : (
        <span className="fhead-age" role="columnheader">
          <span className="vh">{FINDINGS_HEAD.age}</span>
        </span>
      )}
      <span className="fhead-col f2-head-reach" role="columnheader">
        {FINDINGS_HEAD.reach}
      </span>
      <span className="fhead-col f2-head-next" role="columnheader">
        {FINDINGS_HEAD.next}
      </span>
    </div>
  );
}

/** A line across every column of the table: a group head or a run's note. */
function SpanRow({ className, children }: { className: string; children: ComponentChildren }) {
  return (
    <div className={className} role="row">
      <span className="f2-span-cell" role="cell" aria-colspan={FINDINGS_COLUMNS}>
        {children}
      </span>
    </div>
  );
}

function Group({ verdict, findings, axis }: { verdict: string; findings: Finding[]; axis: AgeAxis | null }) {
  const { state } = useReport();
  const { report } = useReport2();
  const printed = usePrinted();
  const hideAccepted = state.filters.accepted.includes(HIDE_ACCEPTED);
  const failing = findings.filter((finding) => finding.gate.fails).length;
  const gateWords = GATE_WORDS.group(failing, findings.length, report.gate.fail_on_applied);
  const majors = majorCountWords(majorCount(findings));
  const rows = (members: readonly Finding[]) =>
    members.map((finding) => (
      <FindingRow2
        key={finding.package}
        finding={finding}
        run={report.run}
        axis={axis}
        hideAccepted={hideAccepted}
        gateQuiet={report.gate.fail_on_applied && failing === findings.length}
      />
    ));
  return (
    // No accessible name: a named <section> is a landmark, and the page's one region is the open
    // package.
    <section className={`fgroup ${toneClass(gradeTone(verdict))}`}>
      <SpanRow className="fgroup-head">
        <h2>{verdict}</h2>
        <span className="fgroup-count">{packagesCount(findings.length)}</span>
        {gateWords !== null && <span className="fgroup-gate">{gateWords}</span>}
        {majors !== null && <span className="fgroup-major">{majors}</span>}
      </SpanRow>
      {/* On paper each group repeats the column head, as a printed table repeats its head row. */}
      {printed && <ColumnHead run={report.run} axis={axis} onScreen={false} />}
      {runSegments(findings).map((segment) => {
        const first = segment.findings[0]?.package ?? "";
        if (segment.key === null) {
          return (
            <div key={first} className="frows" role="rowgroup" aria-label={gradeListLabel(verdict)}>
              {rows(segment.findings)}
            </div>
          );
        }
        const note = runNote(segment.key, segment.findings.length);
        return (
          <div key={first} className="frun">
            <SpanRow className="frun-note">{note}</SpanRow>
            <div className="frows" role="rowgroup" aria-label={note}>
              {rows(segment.findings)}
            </div>
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
  const printed = usePrinted();
  const platform = platformStep(report.run);
  return (
    <section className="f2" data-surface="findings">
      <Notes report={report} />
      {rows.length === 0 ? (
        <EmptyState reason={population2(report, "findings").length === 0 ? "clean" : "filtered"} />
      ) : (
        <>
          {platform !== null && <p className="f2-platform">{platform}</p>}
          <div className="fledger f2-ledger" role="table" aria-label="Findings">
            {!printed && <ColumnHead run={report.run} axis={axis} onScreen />}
            {byGrade(rows).map((group) => (
              <Group key={group.verdict} verdict={group.verdict} findings={group.findings} axis={axis} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
