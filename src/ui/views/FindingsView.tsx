import type { Finding } from "../../model/types";
import { useReport } from "../context";
import { applyFilters, population, quietAdvisoryFindings } from "../../domain/filters";
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

/** `applyFilters` already grouped the list, so finding a boundary is enough. */
function groupByPriority(findings: readonly Finding[]): { priority: string; findings: Finding[] }[] {
  const groups: { priority: string; findings: Finding[] }[] = [];
  for (const finding of findings) {
    const current = groups.at(-1);
    if (current && current.priority === finding.priority) current.findings.push(finding);
    else groups.push({ priority: finding.priority, findings: [finding] });
  }
  return groups;
}

/**
 * A critical row's verdict is never a repeat, so none reads as less urgent than the one above it.
 */
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

function Group({ priority, findings, axis, quoted }: ListProps & { priority: string; findings: Finding[] }) {
  const { model } = useReport();
  const tone = toneClass(TONE(priority));
  return (
    // No accessible name: a named <section> is a landmark, and the page's one region is the open
    // package.
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
        const facts = runFacts(segment.findings, model.report.run.thresholds, model.details);
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

/** On paper (PD-PRINT-4) the group's head is a `table-header-group`, repeated on every page it runs
 *  onto, and each row is a table row, so a page breaks between rows. */
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
        const facts = runFacts(segment.findings, thresholds, model.details);
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

/** The key to a grey bar sits with the axis it qualifies; the words are `aria-hidden`, since each
 *  row names its own parts. */
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

export function FindingsView() {
  const { model, state } = useReport();
  const printed = usePrinted();
  const quiet = quietAdvisoryFindings(model, state);
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
