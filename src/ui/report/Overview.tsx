import { Fragment } from "preact";
import { libyearsPanel } from "../../domain/libyearsPanel";
import {
  acceptedLine,
  depthSentence,
  flagBars,
  foldPeek2,
  GATE_GLYPHS,
  gateState,
  gradeChips,
  leadFigure,
  leadScope,
  multiFlagLine,
  OVERVIEW_WORDS,
  securityBlock,
  updateNowArgv,
  type FlagBar,
  type GateState,
  type Lead,
  type SeverityCount,
} from "../../domain/overviewBand";
import { TONE, type Tone } from "../../domain/vocab";
import type { Report2 } from "../../model/report";
import type { FilterGroup } from "../../state/types";
import { filterTitle, LegendButton, toneClass } from "../common/common";
import { useReport } from "../context";
import { CleanMark } from "../ledger/CleanMark";
import { Waffle } from "../ledger/Waffle";
import "../ledger/ledger.css";
import { CopyMove } from "./CopyMove";
import { useReport2 } from "./useReport";
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

function Figure({ lead }: { lead: Lead }) {
  if (lead.kind === "empty") {
    return (
      <p className="lead-figure">
        <span className="lead-clean lead-empty">{lead.text}</span>
      </p>
    );
  }
  if (lead.kind === "clean") {
    return (
      <p className={`lead-figure ${toneClass("none")}`}>
        <CleanMark size={30} />
        <span className={`lead-clean ${toneClass("none")}`}>{lead.text}</span>
      </p>
    );
  }
  return (
    <p className="lead-figure">
      <span className="lead-num">{lead.figure}</span>
      <span className="lead-of">
        <span className="lead-of-line">{lead.of}</span>{" "}
        <span className="lead-of-line">
          {lead.flagged} <span className="lead-share">{lead.share}</span>
        </span>
      </span>
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

function Lead({ report }: { report: Report2 }) {
  const lead = leadFigure(report);
  const chips = gradeChips(report);
  const scope = lead.kind === "flagged" ? leadScope(report) : [];
  const grades = useToggle("verdict");

  return (
    <div className={`ledger-lead${lead.kind === "flagged" ? "" : ` is-${lead.kind}`}`}>
      <div className="lead-answer">
        <span className="eyebrow">{OVERVIEW_WORDS.flagged}</span>
        <Figure lead={lead} />
        {scope.length > 0 && <p className="lead-scope">{scope.join(" · ")}</p>}
        {chips.length > 0 && (
          <div className="legend lead-chips" role="group" aria-label={OVERVIEW_WORDS.grades}>
            {chips.map(({ grade, count }) => (
              <LegendButton
                key={grade}
                tone={TONE(grade)}
                dim={count === 0}
                pressed={grades.pressed(grade)}
                label={grade}
                count={count}
                onToggle={grades.toggle(grade)}
              />
            ))}
          </div>
        )}
      </div>
      {report.packages_checked > 0 && (
        <figure className="lead-waffle">
          <Waffle
            runs={chips
              .filter(({ count }) => count > 0)
              .map(({ grade, count }) => ({ priority: grade, count }))}
            total={report.packages_checked}
          />
          <figcaption className="lead-waffle-cap">{OVERVIEW_WORDS.perPackage}</figcaption>
        </figure>
      )}
      <GateLine report={report} className="overview2-gate" />
    </div>
  );
}

function FlagBarButton({ bar, longest }: { bar: FlagBar; longest: number }) {
  const flags = useToggle("flag");
  const pressed = flags.pressed(bar.flag);
  return (
    <button
      type="button"
      className="legend-btn legend-btn-bar"
      aria-pressed={pressed}
      title={filterTitle(bar.flag, pressed)}
      onClick={flags.toggle(bar.flag)}
    >
      {bar.flag}{" "}
      <span className="legend-track" aria-hidden="true">
        <span className="legend-fill" style={{ width: `${(bar.carrying / longest) * 100}%` }}>
          {bar.parts.map(({ grade, count }) => (
            <span
              key={grade}
              className={`legend-seg ${toneClass(TONE(grade))}`}
              style={{ flexGrow: count }}
            />
          ))}
        </span>
      </span>
      <i className="count">{bar.carrying}</i> <span className="overview2-split">{bar.split}</span>
    </button>
  );
}

function FlagsBlock({ report }: { report: Report2 }) {
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
            <FlagBarButton key={bar.flag} bar={bar} longest={longest} />
          ))}
        </div>
      )}
      {multi !== null && <p className="ledger-note">{multi}</p>}
      {depth !== null && <p className="ledger-note">{depth}</p>}
      {accepted !== null && <p className="ledger-note">{accepted}</p>}
    </div>
  );
}

const severityTone = ({ band, outlined }: SeverityCount): string =>
  `${toneClass(TONE(band))}${outlined ? " is-outlined" : ""}`;

function SecurityBlock({ report }: { report: Report2 }) {
  const block = securityBlock(report);
  const severities = useToggle("sev");
  const updateNow = updateNowArgv(report);

  return (
    <div className="ledger-block ledger-advisories">
      <span className="eyebrow ledger-head">{OVERVIEW_WORDS.security}</span>
      <p className="ledger-fig">
        {block.figure !== null && (
          <>
            <span className="ledger-fig-num">{block.figure}</span>{" "}
          </>
        )}
        <span className={block.figure === null ? "ledger-fig-text" : "ledger-fig-unit"}>{block.unit}</span>
      </p>
      {block.note !== null && <p className="ledger-note">{block.note}</p>}
      {block.severities.length > 0 && (
        <>
          <div className="advisory-squares" aria-hidden="true">
            {block.severities.map((severity) =>
              Array.from({ length: severity.count }, (_, index) => (
                <i key={`${severity.id}-${index}`} className={`advisory-square ${severityTone(severity)}`} />
              )),
            )}
          </div>
          <div className="legend advisory-chips" role="group" aria-label={OVERVIEW_WORDS.bySeverity}>
            <span className="ledger-quiet-label" aria-hidden="true">
              {OVERVIEW_WORDS.bySeverity}
            </span>
            {block.severities.map((severity) => {
              const pressed = severities.pressed(severity.id);
              return (
                <button
                  key={severity.id}
                  type="button"
                  className={`legend-btn ${severityTone(severity)}`}
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
          {block.fixes.map(({ label, count }, index) => (
            <Fragment key={label}>
              {index > 0 && " · "}
              {label} <b>{count}</b>
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

function LibyearsBlock({ report }: { report: Report2 }) {
  const panel = libyearsPanel(report);
  if (panel === null) return null;
  return (
    <div className="ledger-block ledger-libyears">
      <span className="eyebrow ledger-head">{OVERVIEW_WORDS.libyears}</span>
      <p className="ledger-note overview2-libyears">{panel}</p>
    </div>
  );
}

function Tier({ report }: { report: Report2 }) {
  return (
    <div className="ledger-tier">
      <FlagsBlock report={report} />
      <SecurityBlock report={report} />
      <LibyearsBlock report={report} />
    </div>
  );
}

/** The overview band of a report-2 document (SPEC §7.9.4). It counts nothing a filter changes. */
export function Overview2({ narrow = false }: { narrow?: boolean }) {
  const { state } = useReport();
  const { report } = useReport2();
  if (state.view === "run") return null;
  const empty = report.packages_checked === 0;

  return (
    <section className="ledger overview2" data-surface="overview" aria-label={OVERVIEW_WORDS.band}>
      <Lead report={report} />
      {!empty &&
        (narrow ? (
          <details className="ledger-fold">
            <summary>
              <span className="ledger-fold-summary">
                <span className="ledger-fold-title">{OVERVIEW_WORDS.more}</span>
                <span className="ledger-fold-peek">{foldPeek2(report).join(" · ")}</span>
              </span>
            </summary>
            <Tier report={report} />
          </details>
        ) : (
          <Tier report={report} />
        ))}
    </section>
  );
}
