import { Fragment } from "preact";
import { useId } from "preact/hooks";
import type { Finding, Run } from "../../model/report";
import {
  ageInPill,
  ageReading,
  ageScaleLabel,
  FINDINGS_HEAD,
  GATE_WORDS,
  gradeTone,
  heldByLine,
  maintenanceAccepted,
  moreWord,
  nextStepWords,
  reachLine,
  rowAfter,
  rowCommandArgv,
  rowHolds,
  rowNewLine,
  rowSpoken,
} from "../../domain/findingRow";
import { decimal } from "../../domain/format";
import { safeHref } from "../../domain/links";
import { READY_WORD, readyToRun } from "../../domain/readyToRun";
import { commandWords } from "../../domain/shellArgv";
import type { AgeAxis } from "../../domain/age";
import { useReport } from "../context";
import { toneClass } from "../common/common";
import { innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "../rowOpen";
import { FlagPills } from "./FlagPills";
import { PackageWord, Version } from "./PackageWord";
import { ScoreBar } from "./ScoreBar";

/** 0-100, clamped: a bar past the axis' edge is drawn at the edge. */
function pct(value: number, max: number): string {
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

/** A value's own label: shown where no column head stands over it (the stacked phone row). */
function Label({ text }: { text: string }) {
  return (
    <span className="f2-lbl" aria-hidden="true">
      {text}{" "}
    </span>
  );
}

/** The reading a fired check judged, toned by its published level; the cell stays empty without
 *  one. Positions go through the CSSOM, never a `style="…"` the CSP refuses. */
function AgeCell2({
  finding,
  run,
  axis,
  hideAccepted,
}: {
  finding: Finding;
  run: Run;
  axis: AgeAxis | null;
  hideAccepted: boolean;
}) {
  const reading = axis === null ? null : ageReading(finding, run);
  if (axis === null || reading === null) return <span className="fcell fc-age f2-age is-empty" role="cell" />;
  const label = ageScaleLabel(reading);
  return (
    <span className="fcell fc-age f2-age" role="cell" aria-label={label} title={label}>
      <span className="f2-lbl f2-age-lbl" aria-hidden="true">
        {FINDINGS_HEAD.age}
      </span>
      <span className="age-track" aria-hidden="true">
        <span className="age-guide is-warn" style={{ left: pct(reading.warn, axis.max) }} />
        <span className="age-guide is-high" style={{ left: pct(reading.high, axis.max) }} />
        <span
          className={["age-bar", reading.years > axis.max && "is-over", reading.level === "high" && "is-high"]
            .filter(Boolean)
            .join(" ")}
          style={{ width: pct(reading.years, axis.max) }}
        />
      </span>
      {!ageInPill(finding, run, reading, hideAccepted) && (
        <span className="age-num" aria-hidden="true">
          {decimal(reading.years, 1)}
          <span className="f2-years"> y</span>
        </span>
      )}
    </span>
  );
}

function Reach({ finding }: { finding: Finding }) {
  const line = reachLine(finding);
  return (
    <span className="fcell f2-reach" role="cell">
      <Label text={FINDINGS_HEAD.reach} />
      <span className="f2-reach-lead">{line.lead}</span>
      {line.through !== null && (
        <>
          {" "}
          <PackageWord name={line.through} />
        </>
      )}
      {line.more > 0 && <span className="f2-more"> {moreWord(line.more)}</span>}
      {line.dev && <span className="fc-dev">dev</span>}
    </span>
  );
}

/** A command breaks only between its words; the prompt is drawn by CSS, so a copy takes the
 *  POSIX line alone. */
function Command({ words }: { words: readonly string[] }) {
  return (
    <code className="f2-cmd">
      {words.map((word, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="f2-word">{word}</span>
        </Fragment>
      ))}
    </code>
  );
}

function NextStep({ finding, run }: { finding: Finding; run: Run }) {
  const { cursor } = useReport();
  const words = nextStepWords(finding, run);
  const href = words.href === null ? null : safeHref(words.href);
  const title = words.title ?? undefined;
  const holder = heldByLine(rowHolds(finding), run, finding.package);
  const after = rowAfter(finding);
  const newLine = rowNewLine(finding);
  const argv = rowCommandArgv(finding);
  const command = argv === null ? null : commandWords(argv, "posix");
  return (
    <span className="fcell f2-next" role="cell">
      <Label text={FINDINGS_HEAD.next} />
      {/* A line of its own over the move, so the move keeps its line. */}
      {readyToRun(finding) && <span className="f2-ready">{READY_WORD}</span>}
      <span className="f2-move">
        {href === null ? (
          <span title={title}>{words.text}</span>
        ) : (
          <a
            className="lnk"
            href={href}
            title={title}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={innerTabIndex(finding.package, cursor)}
          >
            {words.text}
          </a>
        )}
        {holder !== null && (
          <span className="f2-held">
            {" "}
            · held by <PackageWord name={holder.name} />
            {holder.more > 0 && <span className="f2-more"> {moreWord(holder.more)}</span>}
          </span>
        )}
      </span>
      {/* The result, then the major-move tag in a slot at the line's end, the same on every row. */}
      {(after !== null || newLine !== null) && (
        <span className="f2-meta">
          <span className="f2-after">{after}</span>
          {newLine !== null && (
            <>
              {after !== null && <span className="vh">; </span>}
              <span className="f2-major">{newLine}</span>
            </>
          )}
        </span>
      )}
      {command !== null && <Command words={command} />}
    </span>
  );
}

function PackageName({ finding }: { finding: Finding }) {
  const slash = finding.package.indexOf("/");
  return (
    <span className="fcell fc-pkg f2-pkg" role="cell">
      <span className="pkg-word">
        {slash > 0 && (
          <>
            <span className="fc-vendor f2-unit">{finding.package.slice(0, slash + 1)}</span>
            <wbr />
          </>
        )}
        <span className="fc-name fc-unit f2-unit">{finding.package.slice(slash + 1)}</span>
      </span>{" "}
      <Version version={finding.version} className="fc-ver" />
    </span>
  );
}

/** A report-2 Findings row: the score and its bar, the package, the flag pills, the age, the reach
 *  and the next step. The grade is the group head's word and the row's tone. */
export function FindingRow2({
  finding,
  run,
  axis,
  hideAccepted,
  gateQuiet,
}: {
  finding: Finding;
  run: Run;
  axis: AgeAxis | null;
  hideAccepted: boolean;
  /** The group head already says that every row fails the gate. */
  gateQuiet: boolean;
}) {
  const { state, dispatch, cursor } = useReport();
  const spoken = `${useId()}-spoken`;
  const accepted = maintenanceAccepted(finding);
  return (
    <div
      role="row"
      className={`frow f2-row ${toneClass(gradeTone(finding.verdict))}`}
      data-pkg={finding.package}
      aria-label={finding.package}
      aria-describedby={spoken}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      tabIndex={rowTabIndex(finding.package, cursor)}
      {...openInteractions(finding.package, dispatch)}
    >
      <span className="fcell f2-score" role="cell">
        <Label text={FINDINGS_HEAD.score} />
        <span className="f2-num" aria-hidden="true">
          {finding.score.total}
        </span>
        <ScoreBar score={finding.score} run={run} />
        {finding.gate.fails && (
          <span className={gateQuiet ? "f2-gate is-quiet" : "f2-gate"}>{GATE_WORDS.row}</span>
        )}
        <span className="vh" id={spoken}>
          {rowSpoken(finding)}
        </span>
      </span>
      <PackageName finding={finding} />
      <span className="fcell f2-flags" role="cell">
        <FlagPills finding={finding} run={run} hideAccepted={hideAccepted} />
        {accepted !== null && <span className="f2-accepted">{accepted}</span>}
      </span>
      <AgeCell2 finding={finding} run={run} axis={axis} hideAccepted={hideAccepted} />
      <Reach finding={finding} />
      <NextStep finding={finding} run={run} />
    </div>
  );
}
