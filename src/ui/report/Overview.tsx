import { Fragment, type ComponentChildren } from "preact";
import { libyearsPanel } from "../../domain/libyearsPanel";
import {
  acceptedLine,
  depthSentence,
  flagBars,
  GATE_GLYPHS,
  gateState,
  gradeChips,
  leadScope,
  multiFlagLine,
  OVERVIEW_WORDS,
  securityBlock,
  updateNowArgv,
  type FlagBar,
  type GateState,
  type SeverityCount,
} from "../../domain/overviewBand";
import { figureLine, GRADE_HEAD, gradeLine, gradeLineHead } from "../../domain/projectGrade";
import { verdictTone } from "../../domain/findingRow";
import { findingsLink } from "../../domain/overviewTab";
import type { Tone } from "../../domain/vocab";
import type { Report2 } from "../../model/report";

type ScoreModel = Report2["run"]["score_model"];
import type { FilterGroup } from "../../state/types";
import { filterTitle, toneClass } from "../common/common";
import { useReport } from "../context";
import { CleanMark } from "../ledger/CleanMark";
import { Waffle } from "../ledger/Waffle";
import "../ledger/ledger.css";
import { CopyMove } from "./CopyMove";
import { TabLink } from "./TabLink";
import "./overview.css";

function useToggle(group: FilterGroup) {
  const { state, dispatch } = useReport();
  return {
    pressed: (key: string) => state.filters[group].includes(key),
    toggle: (key: string) => () => {
      dispatch({ type: "toggle", group, key });
    },
  };
}

/** The grade line, in the largest type: a screen reader meets it before the waffle. */
function GradeLineView({ report }: { report: Report2 }) {
  const line = gradeLine(report);
  if (line === null) return null;
  const clean = line.grade === null;
  return (
    <p className={`ov-grade${clean ? ` ${toneClass("none")}` : ""}`}>
      {clean && <CleanMark size={26} />}
      {line.grade === null || line.link === null ? (
        gradeLineHead(line)
      ) : (
        <>
          {GRADE_HEAD}{" "}
          <TabLink
            target={line.link}
            className={`ov-grade-chip ${toneClass(verdictTone(report.run.score_model, line.grade))}`}
          >
            {line.grade}
          </TabLink>
        </>
      )}
      {line.clauses.map((clause, index) => (
        <Fragment key={index}>
          <span className="ov-grade-sep"> · </span>
          {clause}
        </Fragment>
      ))}
    </p>
  );
}

export const GATE_TONES: Readonly<Record<GateState, Tone>> = {
  fails: "crit",
  not_applied: "low",
  off: "low",
  passes: "none",
};

export function GateLine({ report, className }: { report: Report2; className: string }) {
  const state = gateState(report);
  return (
    <p className={`${className} ${toneClass(GATE_TONES[state])}`}>
      {GATE_GLYPHS[state] !== "" && (
        <span className="overview2-gate-mark" aria-hidden="true">
          {GATE_GLYPHS[state]}
        </span>
      )}
      <span className="overview2-gate-text">{report.gate.text}</span>
    </p>
  );
}

/** The lead of Overview: the grade line, the figure line, the grade chips, the waffle and the gate.
 *  Each chip links to Findings under its grade (PD-OVERVIEW-7). */
export function Lead({ report }: { report: Report2 }) {
  const chips = gradeChips(report);
  const figure = figureLine(report);
  const scope = leadScope(report);

  return (
    <div className="ledger-lead">
      <div className="lead-answer">
        {figure === null ? (
          <p className="ov-empty">{OVERVIEW_WORDS.emptyLock}</p>
        ) : (
          <>
            <GradeLineView report={report} />
            <p className="ov-figure">{figure}</p>
          </>
        )}
        {scope.length > 0 && <p className="lead-scope">{scope.join(" · ")}</p>}
        {chips.length > 0 && (
          <div className="legend lead-chips" role="group" aria-label={OVERVIEW_WORDS.grades}>
            {chips.map(({ grade, count }) => (
              <TabLink
                key={grade}
                target={findingsLink({ verdict: [grade] })}
                className={`legend-btn ${toneClass(verdictTone(report.run.score_model, grade))}${count === 0 ? " legend-btn-dim" : ""}`}
              >
                <i className="swatch" aria-hidden="true" />
                {grade} <i className="count">{count}</i>
              </TabLink>
            ))}
          </div>
        )}
      </div>
      {report.packages_checked > 0 && (
        <figure className="lead-waffle">
          <Waffle
            runs={chips
              .filter(({ count }) => count > 0)
              .map(({ grade, count }) => ({ tone: verdictTone(report.run.score_model, grade), count }))}
            total={report.packages_checked}
          />
          <figcaption className="lead-waffle-cap">{OVERVIEW_WORDS.perPackage}</figcaption>
        </figure>
      )}
      <GateLine report={report} className="overview2-gate" />
    </div>
  );
}

function FlagBarLink({ bar, longest, model }: { bar: FlagBar; longest: number; model: ScoreModel }) {
  return (
    <TabLink target={findingsLink({ flag: [bar.flag] })} className="legend-btn legend-btn-bar">
      {bar.flag}{" "}
      <span className="legend-track" aria-hidden="true">
        <span className="legend-fill" style={{ width: `${(bar.carrying / longest) * 100}%` }}>
          {bar.parts.map(({ grade, count }) => (
            <span
              key={grade}
              className={`legend-seg ${toneClass(verdictTone(model, grade))}`}
              style={{ flexGrow: count }}
            />
          ))}
        </span>
      </span>
      <i className="count">{bar.carrying}</i> <span className="overview2-split">{bar.split}</span>{" "}
      <span className="overview2-points">{bar.points}</span>
    </TabLink>
  );
}

/** The flag ledger: each bar links to Findings under that flag (PD-OVERVIEW-7). */
export function FlagsBlock({ report }: { report: Report2 }) {
  if (report.packages_flagged === 0) return null;
  const bars = flagBars(report);
  const multi = multiFlagLine(report);
  const depth = depthSentence(report);
  const accepted = acceptedLine(report);
  const longest = Math.max(1, ...bars.map(({ carrying }) => carrying));

  return (
    <div className="ledger-block ledger-verdicts">
      <p className="eyebrow ledger-head">
        {OVERVIEW_WORDS.flags}
        {bars.length > 0 && <span className="ledger-head-note">{OVERVIEW_WORDS.flagsNote}</span>}
      </p>
      {bars.length > 0 && (
        <div className="verdict-bars overview2-flag-bars" style={{ "--longest": String(longest) }}>
          {bars.map((bar) => (
            <FlagBarLink key={bar.flag} bar={bar} longest={longest} model={report.run.score_model} />
          ))}
        </div>
      )}
      {multi !== null && <p className="ledger-note">{multi}</p>}
      {depth !== null && <p className="ledger-note">{depth}</p>}
      {accepted !== null && <p className="ledger-note">{accepted}</p>}
    </div>
  );
}

const severityTone = (model: ScoreModel, { band, outlined }: SeverityCount): string =>
  `${toneClass(verdictTone(model, band))}${outlined ? " is-outlined" : ""}`;

/** `answer`, when given, takes the place of the block's own count and hedge. With `linked` the
 *  severity chips and fix counts link to their lists (Overview); else the chips toggle `sev`. */
export function SecurityBlock({
  report,
  answer,
  linked = false,
}: {
  report: Report2;
  answer?: ComponentChildren;
  linked?: boolean;
}) {
  const block = securityBlock(report);
  const severities = useToggle("sev");
  const updateNow = updateNowArgv(report);

  return (
    <div className="ledger-block ledger-advisories">
      <span className="eyebrow ledger-head">{OVERVIEW_WORDS.security}</span>
      {answer ?? (
        <>
          <p className="ledger-fig">
            {block.figure !== null && (
              <>
                <span className="ledger-fig-num">{block.figure}</span>{" "}
              </>
            )}
            <span className={block.figure === null ? "ledger-fig-text" : "ledger-fig-unit"}>
              {block.unit}
            </span>
          </p>
          {block.note !== null && <p className="ledger-note">{block.note}</p>}
        </>
      )}
      {block.severities.length > 0 && (
        <>
          <div className="advisory-squares" aria-hidden="true">
            {block.severities.map((severity) =>
              Array.from({ length: severity.count }, (_, index) => (
                <i
                  key={`${severity.id}-${index}`}
                  className={`advisory-square ${severityTone(report.run.score_model, severity)}`}
                />
              )),
            )}
          </div>
          <div className="legend advisory-chips" role="group" aria-label={OVERVIEW_WORDS.bySeverity}>
            <span className="ledger-quiet-label" aria-hidden="true">
              {OVERVIEW_WORDS.bySeverity}
            </span>
            {block.severities.map((severity) => {
              if (linked)
                return (
                  <TabLink
                    key={severity.id}
                    target={{ view: "advisories", filters: { sev: [severity.id] } }}
                    className={`legend-btn ${severityTone(report.run.score_model, severity)}`}
                  >
                    <i className="swatch" aria-hidden="true" />
                    {severity.id} <i className="count">{severity.count}</i>
                  </TabLink>
                );
              const pressed = severities.pressed(severity.id);
              return (
                <button
                  key={severity.id}
                  type="button"
                  className={`legend-btn ${severityTone(report.run.score_model, severity)}`}
                  aria-pressed={pressed}
                  title={filterTitle(severity.id, pressed)}
                  onClick={severities.toggle(severity.id)}
                >
                  <i className="swatch" aria-hidden="true" />
                  {severity.id} <i className="count">{severity.count}</i>
                </button>
              );
            })}
          </div>
        </>
      )}
      {block.fixes.length > 0 && (
        <p className="ledger-note">
          {OVERVIEW_WORDS.byFix}:{" "}
          {block.fixes.map(({ kind, label, count }, index) => (
            <Fragment key={label}>
              {index > 0 && " · "}
              {linked ? (
                <TabLink target={findingsLink({ fix: [kind] })} className="ov-link">
                  {label} <b>{count}</b>
                </TabLink>
              ) : (
                <>
                  {label} <b>{count}</b>
                </>
              )}
            </Fragment>
          ))}
        </p>
      )}
      {updateNow !== null && (
        <div className="overview2-update">
          <CopyMove argvs={[updateNow]} label={OVERVIEW_WORDS.updateNow} />
        </div>
      )}
    </div>
  );
}

/** The Libyears line of PD-SUMMARY-15, and on Overview its table under it. */
export function LibyearsBlock({ report, children }: { report: Report2; children?: ComponentChildren }) {
  return (
    <div className="ledger-block ledger-libyears">
      <span className="eyebrow ledger-head">{OVERVIEW_WORDS.libyears}</span>
      <p className="ledger-note overview2-libyears">{libyearsPanel(report)}</p>
      {children}
    </div>
  );
}
