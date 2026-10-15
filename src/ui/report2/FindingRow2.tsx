import { useId } from "preact/hooks";
import type { Finding, Run } from "../../model/report2";
import {
  ageReading,
  ageScaleLabel,
  gradeTone,
  HELD_WORD,
  levelTone,
  maintenanceAccepted,
  nextStepWords,
  reachWord,
  rowSpoken,
} from "../../domain/findingRow2";
import { safeHref } from "../../domain/links";
import type { AgeAxis } from "../../domain/age";
import { useReport } from "../context";
import { toneClass } from "../common/common";
import { innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "../rowOpen";
import { FlagPills } from "./FlagPills";
import { ScoreBar } from "./ScoreBar";

/** 0-100, clamped: a bar past the axis' edge is drawn at the edge. */
function pct(value: number, max: number): string {
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

/** The reading a fired check judged, toned by its published level; the cell stays empty without
 *  one. Positions go through the CSSOM, never a `style="…"` the CSP refuses. */
function AgeCell2({ finding, run, axis }: { finding: Finding; run: Run; axis: AgeAxis | null }) {
  const reading = axis === null ? null : ageReading(finding, run);
  if (axis === null || reading === null) return <span className="fcell fc-age f2-age is-empty" />;
  const label = ageScaleLabel(reading);
  const tone = toneClass(levelTone(reading.level));
  return (
    <span className="fcell fc-age f2-age" role="img" aria-label={label} title={label}>
      <span className="age-track" aria-hidden="true">
        <span className="age-guide is-warn" style={{ left: pct(reading.warn, axis.max) }} />
        <span className="age-guide is-high" style={{ left: pct(reading.high, axis.max) }} />
        <span
          className={reading.years > axis.max ? `age-bar ${tone} is-over` : `age-bar ${tone}`}
          style={{ width: pct(reading.years, axis.max) }}
        />
      </span>
      <span className={`age-num is-toned ${tone}`} aria-hidden="true">
        {reading.years.toFixed(1)}
      </span>
    </span>
  );
}

function NextStep({ finding, run }: { finding: Finding; run: Run }) {
  const { cursor } = useReport();
  const words = nextStepWords(finding, run);
  const href = words.href === null ? null : safeHref(words.href);
  const title = words.title ?? undefined;
  return (
    <span className="fcell f2-next">
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
      {words.held && <span className="f2-held"> {HELD_WORD}</span>}
    </span>
  );
}

function PackageName({ finding }: { finding: Finding }) {
  const slash = finding.package.indexOf("/");
  return (
    <span className="fcell fc-pkg f2-pkg">
      {slash > 0 && (
        <>
          <span className="fc-vendor">{finding.package.slice(0, slash + 1)}</span>
          <wbr />
        </>
      )}
      <span className="fc-name fc-unit">{finding.package.slice(slash + 1)}</span>{" "}
      <span className="fc-ver">{finding.version}</span>
    </span>
  );
}

/** A report-2 Findings row (PD-ROWS-14): the score and its bar, the package, the flag pills, the
 *  age, the reach and the next step. The grade is the group head's word and the row's tone. */
export function FindingRow2({
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
  const { state, dispatch, cursor } = useReport();
  const spoken = `${useId()}-spoken`;
  const accepted = maintenanceAccepted(finding);
  return (
    <li
      className={`frow f2-row ${toneClass(gradeTone(finding.verdict))}`}
      data-pkg={finding.package}
      aria-label={finding.package}
      aria-describedby={spoken}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      tabIndex={rowTabIndex(finding.package, cursor)}
      {...openInteractions(finding.package, dispatch)}
    >
      <span className="fcell f2-score">
        <span className="f2-num" aria-hidden="true">
          {finding.score.total}
        </span>
        <ScoreBar score={finding.score} run={run} />
        <span className="vh" id={spoken}>
          {rowSpoken(finding)}
        </span>
      </span>
      <PackageName finding={finding} />
      <span className="fcell f2-flags">
        <FlagPills finding={finding} run={run} hideAccepted={hideAccepted} />
        {accepted !== null && <span className="f2-accepted">{accepted}</span>}
      </span>
      <AgeCell2 finding={finding} run={run} axis={axis} />
      <span className="fcell f2-reach">{reachWord(finding)}</span>
      <NextStep finding={finding} run={run} />
    </li>
  );
}
