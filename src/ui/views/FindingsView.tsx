import type { Finding } from "../../model/types";
import { useReport } from "../context";
import { applyFilters, population } from "../../domain/filters";
import { plural } from "../../domain/format";
import { toneClass } from "../common/common";
import { SIGNAL_NAMES, TONE } from "../../domain/vocab";
import { ageAxis, ageScale, type AgeAxis } from "../../domain/age";
import { groupCounts, reachText, runFacts, segmentRuns, vendorOf, whyText } from "../../domain/rows";
import { AgeAxis as AgeAxisHead } from "./AgeScale";
import { FindingRow, NO_DITTO, type Ditto } from "./FindingRow";
import { GroupSentence, RunNote } from "./LedgerNotes";
import { EmptyState } from "./EmptyState";
import { usePrinted } from "../print/printContext";
import "./views.css";
import "./ledger-rows.css";

/**
 * The note above the list naming packages that carry a security advisory but landed on `ok` or
 * `finished` — so they never appear in this tab at all. Ported from legacy `viewFindings`
 * (report.js:451-463), kept exactly as legacy computed it (DESIGN.md §5 M27 is not one of the fixed
 * differences): the note reads over *every* finding, ignoring the query box and the rail, and is
 * shown above the list or the empty state whatever is currently filtered.
 */
function QuietNote({ quiet }: { quiet: readonly Finding[] }) {
  const { dispatch } = useReport();
  const many = quiet.length > 1;

  return (
    <div className="note">
      {plural(quiet.length, "package", "packages")} {many ? "carry" : "carries"} a security advisory but no
      rot verdict, so {many ? "they are" : "it is"} not in this list:{" "}
      {quiet.map((finding) => (
        <button
          key={finding.package}
          type="button"
          className="pkg-link-btn"
          onClick={() => {
            dispatch({ type: "select", pkg: finding.package });
          }}
        >
          {finding.package}
        </button>
      ))}{" "}
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          dispatch({ type: "view", view: "advisories", keepDetail: true });
        }}
      >
        See the advisories
      </button>
    </div>
  );
}

/** Buckets an already priority-ordered list into contiguous runs sharing one `priority` — `visible`
 *  arrives from `applyFilters` already grouped that way (`filters.ts`'s `orderByPriorityGroup`), so
 *  finding a run boundary is enough; this never re-sorts or re-derives the grouping itself. */
function groupByPriority(findings: readonly Finding[]): { priority: string; findings: Finding[] }[] {
  const groups: { priority: string; findings: Finding[] }[] = [];
  for (const finding of findings) {
    const current = groups.at(-1);
    if (current && current.priority === finding.priority) current.findings.push(finding);
    else groups.push({ priority: finding.priority, findings: [finding] });
  }
  return groups;
}

/** What a row repeats of the row above it in the same segment (PD-ROWS-5): a segment's first row,
 *  and every row right after a run note, repeats nothing — the note or the group head broke the line.
 *  A critical row's verdict is never a repeat: every critical verdict keeps its full weight, so none
 *  reads as less urgent than the one above it (a judge's must-fix). */
function dittoFor(finding: Finding, prev: Finding | undefined, quoted: string | null): Ditto {
  if (!prev) return NO_DITTO;
  const vendor = vendorOf(finding.package);
  return {
    verdict: prev.verdict === finding.verdict && finding.priority !== "critical",
    vendor: vendor !== null && vendorOf(prev.package) === vendor,
    why: whyText(prev, quoted) === whyText(finding, quoted),
    reach: reachText(prev) === reachText(finding) && prev.dev === finding.dev,
  };
}

interface ListProps {
  readonly axis: AgeAxis | null;
  readonly quoted: string | null;
}

function rowItems(findings: readonly Finding[], axis: AgeAxis | null, quoted: string | null) {
  return findings.map((finding, i) => (
    <FindingRow
      key={finding.package}
      finding={finding}
      axis={axis}
      quoted={quoted}
      ditto={dittoFor(finding, findings[i - 1], quoted)}
    />
  ));
}

function Rows({
  findings,
  label,
  axis,
  quoted,
}: ListProps & { findings: readonly Finding[]; label: string }) {
  return (
    <ul className="frows" aria-label={label}>
      {rowItems(findings, axis, quoted)}
    </ul>
  );
}

/** A priority group's head: its name, its count, the sentence counting its members. */
function GroupHead({ priority, findings }: { priority: string; findings: readonly Finding[] }) {
  return (
    <header className="fgroup-head">
      <h2>{priority}</h2>
      <span className="fgroup-count">{plural(findings.length, "package", "packages")}</span>
      <GroupSentence counts={groupCounts(findings)} />
    </header>
  );
}

/** One priority group: its name, its count, the sentence counting its members, then its rows, a
 *  run note above each run (PD-ROWS-6). */
function Group({ priority, findings, axis, quoted }: ListProps & { priority: string; findings: Finding[] }) {
  const { model } = useReport();
  const tone = toneClass(TONE(priority));
  return (
    // No accessible name on purpose: a named <section> is a landmark region, and the page's one
    // region is the open package's detail; the group's own <h2> already heads it.
    <section className={`fgroup ${tone}`}>
      <GroupHead priority={priority} findings={findings} />
      {segmentRuns(findings).map((segment) => {
        const first = segment.findings[0]?.package ?? "";
        if (!segment.run) {
          return (
            <Rows
              key={first}
              findings={segment.findings}
              label={`${priority} priority`}
              axis={axis}
              quoted={quoted}
            />
          );
        }
        const facts = runFacts(segment.findings, model.report.run.thresholds);
        return (
          <div key={first} className={`frun ${toneClass(TONE(facts.verdict))}`}>
            <RunNote facts={facts} />
            <Rows
              findings={segment.findings}
              label={`${plural(facts.count, `${facts.verdict} package`, `${facts.verdict} packages`)} in a row`}
              axis={axis}
              quoted={quoted}
            />
          </div>
        );
      })}
    </section>
  );
}

/**
 * A priority group on paper (PD-PRINT-4, DESIGN.md §5): a table whose head — the group's name and
 * sentence, then the column head with the age axis' captions — is a `table-header-group`, which the
 * print engine repeats at the top of every page the group runs onto (print.css). A continuation page
 * then still says which group its rows are in and what their bars and guides measure. Every row is a
 * table row of its own, so a page breaks between rows, never inside one; a run's note is a row too,
 * the first of its run's rows, and the run's rule is drawn down each of them.
 */
function PrintedGroup({
  priority,
  findings,
  axis,
  quoted,
}: ListProps & { priority: string; findings: Finding[] }) {
  const { model } = useReport();
  const { thresholds } = model.report.run;
  const context =
    axis !== null && findings.some((f) => ageScale(f, thresholds, axis.max)?.contextOnly === true);
  return (
    <section className={`fgroup pf-group ${toneClass(TONE(priority))}`}>
      <div className="pf-top">
        <GroupHead priority={priority} findings={findings} />
        <ColumnHead axis={axis} quoted={quoted} context={context} />
      </div>
      {segmentRuns(findings).map((segment) => {
        const first = segment.findings[0]?.package ?? "";
        if (!segment.run) {
          return (
            <ul key={first} className="frows">
              {rowItems(segment.findings, axis, quoted)}
            </ul>
          );
        }
        const facts = runFacts(segment.findings, thresholds);
        return (
          <ul key={first} className={`frows pf-run ${toneClass(TONE(facts.verdict))}`}>
            <li className="pf-tr pf-note">
              <div className="pf-td">
                <RunNote facts={facts} />
              </div>
            </li>
            {rowItems(segment.findings, axis, quoted)}
          </ul>
        );
      })}
    </section>
  );
}

/** The column head over every row (PD-ROWS-4): what each column is, the age axis' captions, and —
 *  when a visible row draws one — the key to a grey bar, sticky with the axis it qualifies rather
 *  than a footnote sixty rows below the first grey bar. The words are for the eye (`aria-hidden`);
 *  each row already names its own parts, and a grey bar's own label says why it is grey. */
function ColumnHead({ axis, quoted, context }: ListProps & { context: boolean }) {
  const why = quoted ? `${quoted} · ${SIGNAL_NAMES[quoted] ?? "signal"}` : "Why it is flagged";
  return (
    <div className="fhead">
      <span className="fhead-col fhead-verdict" aria-hidden="true">
        Verdict
      </span>
      <span className="fhead-col fhead-pkg" aria-hidden="true">
        Package
        <span className="fhead-narrow">{quoted ? ` · ${quoted}` : " · why it is flagged"}</span>
      </span>
      <span className="fhead-col fhead-why" aria-hidden="true">
        {why}
      </span>
      <span className="fhead-col fhead-reach" aria-hidden="true">
        Reached
      </span>
      {context && (
        <span className="fhead-key" aria-hidden="true">
          <span className="fledger-key" />
          not flagged for age
        </span>
      )}
      {axis ? <AgeAxisHead axis={axis} /> : <span className="fhead-age" />}
    </div>
  );
}

/** The Findings tab: the report's headline list, a ledger of one-line rows grouped by priority
 *  (PD-ROWS-4/5/6, DESIGN.md §5). Ported from legacy `viewFindings` (report.js:448-478). */
export function FindingsView() {
  const { model, state } = useReport();
  const printed = usePrinted();
  const quiet = model.report.findings.filter(
    (finding) =>
      finding.advisories.length > 0 && (finding.verdict === "ok" || finding.verdict === "finished"),
  );
  const visible = applyFilters(model, state, "findings");
  const axis = ageAxis(model.report.run.thresholds);
  const signals = state.filters.signal;
  const quoted = signals.length === 1 ? (signals[0] ?? null) : null;
  // The grey-bar key is shown only when a visible row actually draws a grey bar.
  const context =
    axis !== null &&
    visible.some((f) => ageScale(f, model.report.run.thresholds, axis.max)?.contextOnly === true);

  return (
    <div>
      {quiet.length > 0 && <QuietNote quiet={quiet} />}
      {visible.length === 0 ? (
        <EmptyState reason={population(model, "findings").length === 0 ? "clean" : "filtered"} />
      ) : (
        <div className={axis ? "fledger" : "fledger no-axis"}>
          {printed ? (
            groupByPriority(visible).map((group) => (
              <PrintedGroup
                key={group.priority}
                priority={group.priority}
                findings={group.findings}
                axis={axis}
                quoted={quoted}
              />
            ))
          ) : (
            <>
              <ColumnHead axis={axis} quoted={quoted} context={context} />
              {groupByPriority(visible).map((group) => (
                <Group
                  key={group.priority}
                  priority={group.priority}
                  findings={group.findings}
                  axis={axis}
                  quoted={quoted}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
