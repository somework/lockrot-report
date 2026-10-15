import { OVERVIEW_WORDS } from "../../domain/overviewBand";
import {
  exposureBars,
  exposureUnit,
  libyearsTop,
  OVERVIEW_TAB_WORDS,
  scoreStrip,
  type ScoreStack,
} from "../../domain/overviewTab";
import { verdictTone } from "../../domain/findingRow";
import type { Report2 } from "../../model/report";
import { toneClass } from "../common/common";
import { usePrinted } from "../print/printContext";
import { FlagsBlock, Lead, LibyearsBlock, SecurityBlock } from "./Overview";
import { TabLink } from "./TabLink";
import { useReport2 } from "./useReport";
import "./overview-tab.css";

type ScoreModel = Report2["run"]["score_model"];

function Stack({ stack, model }: { stack: ScoreStack; model: ScoreModel }) {
  return (
    <span className="ss-stack" style={{ left: `${stack.at * 100}%` }}>
      {stack.marks.map((mark) => (
        <i key={mark.package} className={`ss-mark ${toneClass(verdictTone(model, mark.verdict))}`} />
      ))}
    </span>
  );
}

/** PD-OVERVIEW-4: the stacks are a drawing, said by a list a screen reader reads. The band zones
 *  of the ruler are the strip's links, each at least 24px a side (WCAG 2.5.8). */
function ScoreStripBlock({ report }: { report: Report2 }) {
  const strip = scoreStrip(report);
  const printed = usePrinted();
  if (strip.stacks.length === 0) return null;
  const model = report.run.score_model;

  return (
    <div className="ledger-block ov-scores">
      <p className="eyebrow ledger-head">
        {OVERVIEW_TAB_WORDS.scores} <span className="ledger-head-note">{OVERVIEW_TAB_WORDS.scoresNote}</span>
      </p>
      {printed ? (
        <p className="ledger-note">{strip.stacks.map(({ say }) => say).join(" · ")}</p>
      ) : (
        <div className="ss">
          <div className="ss-plot" aria-hidden="true">
            {strip.labels.slice(1, -1).map(({ value, at }) => (
              <span key={value} className="ss-guide" style={{ left: `${at * 100}%` }} />
            ))}
            {strip.stacks.map((stack) => (
              <Stack key={stack.total} stack={stack} model={model} />
            ))}
          </div>
          <ul className="vh" aria-label={OVERVIEW_TAB_WORDS.scores}>
            {strip.stacks.map((stack) => (
              <li key={stack.total}>{stack.say}</li>
            ))}
          </ul>
          <div className="ss-rule">
            {strip.zones.map((zone) => (
              <span
                key={zone.verdict}
                className="ss-zone-slot"
                style={{ left: `${zone.from * 100}%`, width: `${(zone.to - zone.from) * 100}%` }}
              >
                <TabLink
                  target={zone.link}
                  label={zone.say}
                  className={`ss-zone ${toneClass(verdictTone(model, zone.verdict))}`}
                >
                  {zone.verdict}
                </TabLink>
              </span>
            ))}
          </div>
          <div className="ss-axis" aria-hidden="true">
            {strip.labels.map(({ value, at }) => (
              <span key={value} style={{ left: `${at * 100}%` }}>
                {value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** PD-OVERVIEW-5: the first rows of `exposure[]`, each a link to Blast radius. */
function ExposureBlock({ report }: { report: Report2 }) {
  const bars = exposureBars(report);
  if (bars.rows.length === 0 && bars.shared === null) return null;

  return (
    <div className="ledger-block ov-exposure">
      <p className="eyebrow ledger-head">
        {OVERVIEW_TAB_WORDS.exposure}{" "}
        <span className="ledger-head-note">{OVERVIEW_TAB_WORDS.exposureNote}</span>
      </p>
      {bars.rows.length > 0 && (
        <ul className="ov-ex">
          {bars.rows.map((row) => (
            <li key={row.package}>
              <TabLink target={bars.link} className="ov-ex-row">
                <span className="ov-ex-name">{row.package}</span>
                <span className="ov-ex-track" aria-hidden="true">
                  <span className="ov-ex-fill" style={{ width: `${(row.flagged / bars.longest) * 100}%` }} />
                </span>
                <span className="ov-ex-count">
                  {row.flagged}
                  <span className="vh"> {exposureUnit(row.flagged)}</span>
                </span>
              </TabLink>
            </li>
          ))}
        </ul>
      )}
      {bars.more !== null && (
        <p className="ledger-note">
          <TabLink target={bars.link} className="ov-link">
            {bars.more} <span aria-hidden="true">›</span>
          </TabLink>
        </p>
      )}
      {bars.shared !== null && <p className="ledger-note">{bars.shared}</p>}
    </div>
  );
}

/** PD-OVERVIEW-6: the packages furthest behind, each linked to its row. */
function LibyearsTable({ report }: { report: Report2 }) {
  const rows = libyearsTop(report);
  if (rows.length === 0) return null;
  const model = report.run.score_model;

  return (
    <table className="ov-ly">
      <caption className="eyebrow">{OVERVIEW_TAB_WORDS.libyearsTop}</caption>
      <thead>
        <tr>
          <th scope="col">{OVERVIEW_TAB_WORDS.package}</th>
          <th scope="col" className="num">
            {OVERVIEW_TAB_WORDS.libyears}
          </th>
          <th scope="col">{OVERVIEW_TAB_WORDS.grade}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.package}>
            <td>
              <TabLink target={row.link} className="ov-link">
                {row.package}
              </TabLink>{" "}
              <span className="ov-ly-version">{row.version}</span>
            </td>
            <td className="num">{row.libyears}</td>
            <td>
              <span className={`ov-ly-grade ${toneClass(verdictTone(model, row.grade))}`}>{row.grade}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The Overview tab, the default view (PD-OVERVIEW-1, PD-OVERVIEW-2): the lead, then the flags,
 * Security, the score strip, exposure and Libyears in that reading order. From 760px a grid puts
 * Libyears beside Security. Paper prints the same content as its summary section.
 */
export function OverviewView2() {
  const { report } = useReport2();
  const empty = report.packages_checked === 0;

  return (
    <section className="ledger ov" data-surface="overview" aria-label={OVERVIEW_WORDS.band}>
      <div className="ov-lead">
        <Lead report={report} />
      </div>
      {!empty && (
        <>
          <div className="ov-flags">
            <FlagsBlock report={report} />
          </div>
          <div className="ov-security">
            <SecurityBlock report={report} linked />
          </div>
          <div className="ov-score">
            <ScoreStripBlock report={report} />
          </div>
          <div className="ov-expo">
            <ExposureBlock report={report} />
          </div>
          <div className="ov-libyears">
            <LibyearsBlock report={report}>
              <LibyearsTable report={report} />
            </LibyearsBlock>
          </div>
        </>
      )}
    </section>
  );
}
