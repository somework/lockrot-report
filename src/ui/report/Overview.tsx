import { Fragment, type ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import {
  firstMoves,
  FIRST_WORDS,
  gateLineTarget,
  type ReadyMove,
  type WordPart,
} from "../../domain/firstMoves";
import { libyearsLead } from "../../domain/libyearsLead";
import {
  acceptedLine,
  flagBars,
  GATE_GLYPHS,
  gateState,
  gradeChips,
  leadScope,
  multiFlagLine,
  OVERVIEW_WORDS,
  securityBlock,
  type FlagBar,
  type GateState,
  type SeverityCount,
} from "../../domain/overviewBand";
import { figureLine, GRADE_HEAD, gradeLine, gradeLineHead, waffleCaption } from "../../domain/projectGrade";
import { verdictTone } from "../../domain/findingRow";
import { findingsLink } from "../../domain/overviewTab";
import { stateLines } from "../../domain/runState";
import { waffleRuns } from "../../domain/summary";
import { lookupWord } from "../../domain/pageVocabulary";
import type { Tone } from "../../domain/vocab";
import type { Report2 } from "../../model/report";
import type { FilterGroup } from "../../state/types";
import { filterTitle, toneClass } from "../common/common";
import { useReport } from "../context";
import { CleanMark } from "../ledger/CleanMark";
import { Waffle, WaffleKey } from "../ledger/Waffle";
import "../ledger/ledger.css";
import { CopyMove } from "./CopyMove";
import { PkgName, Words } from "./PkgName";
import { TabLink } from "./TabLink";
import "./overview.css";

type ScoreModel = Report2["run"]["score_model"];

function useToggle(group: FilterGroup) {
  const { state, dispatch } = useReport();
  return {
    pressed: (key: string) => state.filters[group].includes(key),
    toggle: (key: string) => () => {
      dispatch({ type: "toggle", group, key });
    },
  };
}

/** The grade line, in the largest type: a screen reader meets it before the waffle. Its clauses
 *  break onto a second, smaller line; the text stays one sentence. */
function GradeLineView({ report }: { report: Report2 }) {
  const line = gradeLine(report);
  if (line === null) return null;
  // Nothing graded reads as all-clear only when the gate passes; above a failing gate it is neutral.
  const clean = line.grade === null;
  const allClear = clean && !report.gate.fails;
  return (
    <h3 className={`ov-grade${clean ? ` ${toneClass(allClear ? "none" : "unk")}` : ""}`}>
      <span className="ov-grade-head">
        {allClear && <CleanMark size={28} />}
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
      </span>
      {line.clauses.length > 0 && (
        <span className="ov-grade-rest">
          {line.clauses.map((clause, index) => (
            <Fragment key={index}>
              <span className={index === 0 ? "vh" : "ov-grade-sep"}> · </span>
              {clause}
            </Fragment>
          ))}
        </span>
      )}
    </h3>
  );
}

export const GATE_TONES: Readonly<Record<GateState, Tone>> = {
  fails: "crit",
  not_applied: "unk",
  off: "unk",
  passes: "none",
};

/** `gate.text` as written. With `linked`, a failing gate opens the findings that fail it. */
export function GateLine({
  report,
  className,
  linked = false,
}: {
  report: Report2;
  className: string;
  linked?: boolean;
}) {
  const state = gateState(report);
  const body = (
    <>
      {GATE_GLYPHS[state] !== "" && (
        <span className="overview2-gate-mark" aria-hidden="true">
          {GATE_GLYPHS[state]}
        </span>
      )}
      <span className="overview2-gate-text">
        <Words text={report.gate.text} />
      </span>
    </>
  );
  const classes = `${className} ${toneClass(GATE_TONES[state])} is-${state}`;
  const target = linked ? gateLineTarget(report) : null;
  if (target !== null)
    return (
      <p className={classes}>
        <TabLink target={target} className="overview2-gate-link">
          {body}
          <span className="overview2-gate-go" aria-hidden="true">
            ›
          </span>
        </TabLink>
      </p>
    );
  return <p className={classes}>{body}</p>;
}

/** One state line: a bold head, then its clauses, each count a link where it has a list. */
function StateLines({ report }: { report: Report2 }) {
  const lines = stateLines(report);
  if (lines.length === 0) return null;
  return (
    <ul className="ov-states">
      {lines.map((line) => (
        <li key={line.kind} className={`ov-state is-${line.kind}`}>
          {line.head !== null && <b className="ov-state-head">{line.head}: </b>}
          {line.parts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && " · "}
              {part.link === null ? (
                part.text
              ) : (
                <TabLink target={part.link} className="ov-link">
                  {part.text}
                </TabLink>
              )}
            </Fragment>
          ))}
          {"."}
          {line.more !== null && (
            <>
              {" "}
              <TabLink target={line.more.link} className="ov-link ov-state-more">
                {line.more.text} <span aria-hidden="true">›</span>
              </TabLink>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Words with an id the page does not know printed as written in a code element. */
function PartWords({ parts }: { parts: readonly WordPart[] }) {
  return <>{parts.map((part, index) => (part.code ? <code key={index}>{part.text}</code> : part.text))}</>;
}

function MoveItem({ move, model }: { move: ReadyMove; model: ScoreModel }) {
  return (
    <li className="ov-move">
      <p className="ov-move-who">
        <TabLink target={move.link} className="ov-link ov-move-pkg">
          <PkgName name={move.package} />
        </TabLink>{" "}
        <span className={`ov-tag ${toneClass(verdictTone(model, move.grade))}`}>{move.grade}</span>
        {move.newMajor && <span className="ov-tag ov-tag-plain">{FIRST_WORDS.newMajor}</span>}
      </p>
      <CopyMove argvs={[move.argv]} className="ov-cmd" />
      {(move.clears !== null || move.after !== null) && (
        <p className="ov-move-what">
          {move.clears !== null && (
            <span>
              {FIRST_WORDS.clears} <b>{move.clears}</b>
            </span>
          )}
          {move.clears !== null && move.after !== null && <span className="ov-sep"> · </span>}
          {move.after !== null && (
            <span>
              {FIRST_WORDS.after}: {[move.after.result, ...move.after.conditions].join(", ")}
            </span>
          )}
        </p>
      )}
      {move.alsoHolds !== null && <p className="ov-move-also">{move.alsoHolds}</p>}
    </li>
  );
}

/** "Ready to run" (coordinator decision 2026-10-18): the moves of accepted derivation 10, then the
 *  held count line; no fallback command. */
function FirstMovesBlock({ report }: { report: Report2 }) {
  const first = firstMoves(report);
  const headId = useId();
  return (
    <section className="ov-first" aria-labelledby={headId}>
      <h3 className="ov-first-head" id={headId}>
        {FIRST_WORDS.head} {first.note !== null && <span className="ov-first-note">{first.note}</span>}
      </h3>
      {first.moves.length > 0 && (
        <ol className="ov-moves">
          {first.moves.map((move) => (
            <MoveItem key={move.package} move={move} model={report.run.score_model} />
          ))}
        </ol>
      )}
      {first.none !== null && <p className="ov-first-none">{first.none}</p>}
      {(first.more !== null || first.held !== null || first.wayOut !== null) && (
        <p className="ov-first-foot">
          {first.held !== null &&
            (first.heldLink === null ? (
              <span>{first.held}</span>
            ) : (
              <TabLink target={first.heldLink} className="ov-link">
                {first.held} <span aria-hidden="true">›</span>
              </TabLink>
            ))}
          {first.wayOutParts !== null &&
            (first.wayOutLink === null ? (
              <span>
                <PartWords parts={first.wayOutParts} />
              </span>
            ) : (
              <TabLink target={first.wayOutLink} className="ov-link">
                <PartWords parts={first.wayOutParts} /> <span aria-hidden="true">›</span>
              </TabLink>
            ))}
          {first.more !== null && first.moreLink !== null && (
            <TabLink target={first.moreLink} className="ov-link">
              {first.more} <span aria-hidden="true">›</span>
            </TabLink>
          )}
        </p>
      )}
    </section>
  );
}

/** The grade chips, the waffle and its key: one picture of every package by verdict. */
function VerdictPicture({ report }: { report: Report2 }) {
  const chips = gradeChips(report);
  const runs = waffleRuns(report);
  const figure = waffleCaption(report);
  const scope = leadScope(report);
  return (
    <figure className="ov-picture">
      {figure !== null && <p className="ov-figure">{figure}</p>}
      {scope.length > 0 && <p className="lead-scope">{scope.join(" · ")}</p>}
      {chips.length > 0 && (
        <div className="legend lead-chips" role="group" aria-label={OVERVIEW_WORDS.grades}>
          {chips.map(({ grade, count }) => (
            <TabLink
              key={grade}
              target={findingsLink({ verdict: [grade] })}
              className={`legend-btn ${toneClass(verdictTone(report.run.score_model, grade))}`}
            >
              <i className="swatch" aria-hidden="true" />
              {grade} <i className="count">{count}</i>
            </TabLink>
          ))}
        </div>
      )}
      <Waffle runs={runs} />
      <figcaption className="lead-waffle-cap">
        <span>{OVERVIEW_WORDS.perPackage}</span>
        <WaffleKey runs={runs} />
      </figcaption>
    </figure>
  );
}

/** The lead of Overview: what lockrot is, the grade, the gate, what limits the run, what is ready to
 *  run, then every package as a square. Each chip links to Findings under its grade. */
export function Lead({ report }: { report: Report2 }) {
  const figure = figureLine(report);
  const hasMoves = firstMoves(report).moves.length > 0;

  return (
    <div className={`ov-top${hasMoves ? "" : " no-moves"}`}>
      <p className="ov-kicker">{OVERVIEW_WORDS.kicker}</p>
      <div className="ov-answer">
        {figure === null ? (
          <p className="ov-empty">{OVERVIEW_WORDS.emptyLock}</p>
        ) : (
          <GradeLineView report={report} />
        )}
      </div>
      <div className="ov-gate-wrap">
        <GateLine report={report} className="overview2-gate" linked />
        <StateLines report={report} />
      </div>
      {report.packages_checked > 0 && (
        <>
          <FirstMovesBlock report={report} />
          <VerdictPicture report={report} />
          <div className="ov-lead-security">
            <SecurityBlock report={report} linked />
          </div>
        </>
      )}
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
  const accepted = acceptedLine(report);
  const longest = Math.max(1, ...bars.map(({ carrying }) => carrying));

  return (
    <div className="ledger-block ledger-verdicts">
      <h3 className="eyebrow ledger-head">
        {OVERVIEW_WORDS.flags}{" "}
        {bars.length > 0 && <span className="ledger-head-note">{OVERVIEW_WORDS.flagsNote}</span>}
      </h3>
      {bars.length > 0 && (
        <div className="verdict-bars overview2-flag-bars" style={{ "--longest": String(longest) }}>
          {bars.map((bar) => (
            <FlagBarLink key={bar.flag} bar={bar} longest={longest} model={report.run.score_model} />
          ))}
        </div>
      )}
      {multi !== null && <p className="ledger-note">{multi}</p>}
      {report.abandoned.total > 0 && (
        <p className="ledger-note">
          <TabLink target={findingsLink({ flag: ["abandoned"] })} className="ov-link">
            {OVERVIEW_WORDS.abandoned(report.abandoned.total, report.abandoned.with_replacement)}{" "}
            <span aria-hidden="true">›</span>
          </TabLink>
        </p>
      )}
      {accepted !== null && <p className="ledger-note">{accepted}</p>}
    </div>
  );
}

const severityTone = (model: ScoreModel, { band, outlined }: SeverityCount): string =>
  `${toneClass(verdictTone(model, band))}${outlined ? " is-outlined" : ""}`;

/** `answer`, when given, takes the place of the block's own count and hedge. With `linked` the
 *  severity chips and fix counts link to their lists and the head is a heading (Overview); else the
 *  chips toggle `sev` (Advisories). */
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

  return (
    <div className="ledger-block ledger-advisories">
      {linked ? (
        <h3 className="eyebrow ledger-head">{OVERVIEW_WORDS.security}</h3>
      ) : (
        <span className="eyebrow ledger-head">{OVERVIEW_WORDS.security}</span>
      )}
      {answer ?? (
        <>
          <p className="ledger-fig">
            {block.figure === null && report.security.check === "complete" && (
              <span className={toneClass("none")}>
                <CleanMark size={20} />
              </span>
            )}
            {block.figure !== null && linked ? (
              <TabLink target={{ view: "advisories" }} className="ledger-fig-link">
                <span className="ledger-fig-num">{block.figure}</span>{" "}
                <span className="ledger-fig-unit">{block.unit}</span>
                <span aria-hidden="true"> ›</span>
              </TabLink>
            ) : (
              <>
                {block.figure !== null && (
                  <>
                    <span className="ledger-fig-num">{block.figure}</span>{" "}
                  </>
                )}
                <span
                  className={
                    block.figure !== null
                      ? "ledger-fig-unit"
                      : `ledger-fig-text ${toneClass(report.security.check === "complete" ? "none" : "unk")}`
                  }
                >
                  {block.unit}
                </span>
              </>
            )}
          </p>
          {block.note !== null && <p className="ledger-note">{block.note}</p>}
          {linked && report.security.check === "complete" && (
            <p className="ledger-note">{lookupWord("complete", null)}</p>
          )}
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
      {linked &&
        block.severities.flatMap(({ id, countedAs }) =>
          countedAs === null
            ? []
            : [
                <p key={id} className="ledger-note">
                  {countedAs}
                </p>,
              ],
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
    </div>
  );
}

/** The Libyears block: one number, its scope, the causes not measured, then the table. */
export function LibyearsBlock({ report, children }: { report: Report2; children?: ComponentChildren }) {
  const lead = libyearsLead(report);
  return (
    <div className="ledger-block ledger-libyears">
      <div className="ov-part">
        <h3 className="eyebrow ledger-head">{OVERVIEW_WORDS.libyears}</h3>
        {lead.figure !== null && (
          <p className="ledger-fig">
            {lead.bound !== "" && <span className="ledger-fig-unit">{lead.bound}</span>}{" "}
            <span className="ledger-fig-num">{lead.figure}</span>{" "}
            <span className="ledger-fig-unit">{OVERVIEW_WORDS.libyearsUnit}</span>
          </p>
        )}
        <p className="ledger-note">{lead.sub}</p>
        {lead.unmeasured !== null && <p className="ledger-note">{lead.unmeasured}</p>}
      </div>
      {children !== undefined && <div className="ov-part">{children}</div>}
    </div>
  );
}
