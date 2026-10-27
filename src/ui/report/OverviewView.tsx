import { Fragment } from "preact";
import { OVERVIEW_WORDS } from "../../domain/overviewBand";
import {
  depthRows,
  exposureBars,
  exposureUnit,
  libyearsTop,
  OVERVIEW_TAB_WORDS,
} from "../../domain/overviewTab";
import { depthSentence } from "../../domain/overviewBand";
import { loadLine, weighsMost, WEIGHS_WORDS, type WeighsRow } from "../../domain/projectGrade";
import { verdictTone } from "../../domain/findingRow";
import type { Report2 } from "../../model/report";
import { toneClass } from "../common/common";
import { FlagsBlock, Lead, LibyearsBlock } from "./Overview";
import { PkgName } from "./PkgName";
import { TabLink } from "./TabLink";
import { useReport2 } from "./useReport";
import "./overview-tab.css";

type ScoreModel = Report2["run"]["score_model"];

/** The segments of one row, on the shared `bar_max` scale, in the row's grade tone: one hue means
 *  one grade across the page; the terms line names each segment. */
function WeighsBar({ row }: { row: WeighsRow }) {
  return (
    <span className={row.over ? "wm-bar is-over" : "wm-bar"} aria-hidden="true">
      {row.segments.map((segment, i) => (
        <span
          key={`${String(i)}-${segment.flag}`}
          className={segment.cut ? "wm-seg is-cut" : "wm-seg"}
          style={{ width: `max(var(--wm-seg-min), ${String(segment.width * 100)}%)` }}
        />
      ))}
    </span>
  );
}

function WeighsItem({ row, model }: { row: WeighsRow; model: ScoreModel }) {
  return (
    <li className={`wm-row ${toneClass(verdictTone(model, row.grade))}`}>
      <span className="wm-label">
        <TabLink target={row.link} className="ov-link wm-pkg">
          <PkgName name={row.package} />
        </TabLink>
      </span>
      <span className="wm-grade">
        <span className="ov-tag">{row.grade}</span>
      </span>
      <span className="wm-reach">{row.reach}</span>
      <WeighsBar row={row} />
      <span className="wm-total">
        {row.total}
        <span className="vh"> {row.unit}:</span>
      </span>
      <span className="wm-terms">
        {row.terms.map((part, i) => (
          <Fragment key={i}>
            {i > 0 && " · "}
            <span className="nb">{part}</span>
          </Fragment>
        ))}
        {row.termsTotal !== null && <> {row.termsTotal}</>}
      </span>
    </li>
  );
}

/** "Weighs most" (SPEC §7.9.4): the load line, then the highest scores, one line each. The full
 *  `score.text` of a row is in its sheet. */
function WeighsMostBlock({ report }: { report: Report2 }) {
  const chart = weighsMost(report);
  const load = loadLine(report);
  if (chart === null || load === null || chart.rows.length === 0) return null;

  return (
    <div className="ledger-block wm">
      <h3 className="eyebrow ledger-head">
        {WEIGHS_WORDS.head} <span className="ledger-head-note">{WEIGHS_WORDS.note}</span>
      </h3>
      <p className="wm-load">{load}</p>
      <ol className="wm-list">
        {chart.rows.map((row) => (
          <WeighsItem key={row.package} row={row} model={report.run.score_model} />
        ))}
      </ol>
      {chart.rest !== null && chart.restLink !== null && (
        <p className="ledger-note">
          <TabLink target={chart.restLink} className="ov-link">
            {chart.rest} <span aria-hidden="true">›</span>
          </TabLink>
        </p>
      )}
    </div>
  );
}

/** One neutral bar: exposure and depth share the chart style of every Overview bar. */
function CountBar({ value, scale }: { value: number; scale: number }) {
  return (
    <span className="ov-ex-track" aria-hidden="true">
      <span className="ov-ex-fill" style={{ width: `${(value / scale) * 100}%` }} />
    </span>
  );
}

/** PD-OVERVIEW-5 and the depth waterline: the first rows of `exposure[]` against the flagged set,
 *  then `rot_depth.by_depth`. Both read fields only. The block is named by what it holds. */
function ExposureBlock({ report }: { report: Report2 }) {
  const bars = exposureBars(report);
  const depth = depthRows(report);
  const sentence = depthSentence(report);
  const exposure = bars.rows.length > 0 || bars.shared !== null;
  if (!exposure && depth.length === 0 && sentence === null) return null;
  const depthScale = Math.max(1, report.rot_depth.flagged);
  const depthPart = (depth.length > 0 || sentence !== null) && (
    <div className="ov-part">
      {exposure ? (
        <h4 className="ov-subhead">{OVERVIEW_TAB_WORDS.depth}</h4>
      ) : (
        <h3 className="eyebrow ledger-head">{OVERVIEW_TAB_WORDS.depth}</h3>
      )}
      {depth.length > 0 && (
        <ul className="ov-ex is-static">
          {depth.map((row) => (
            <li key={row.label} className="ov-ex-row">
              <span className="ov-ex-name">{row.label}</span>
              <CountBar value={row.flagged} scale={depthScale} />
              <span className="ov-ex-count">{row.flagged}</span>
            </li>
          ))}
        </ul>
      )}
      {sentence !== null && <p className="ledger-note">{sentence}</p>}
    </div>
  );

  return (
    <div className="ledger-block ov-exposure">
      {exposure && (
        <div className="ov-part">
          <h3 className="eyebrow ledger-head">
            {OVERVIEW_TAB_WORDS.exposure}{" "}
            <span className="ledger-head-note">{OVERVIEW_TAB_WORDS.exposureNote}</span>
          </h3>
          {bars.count !== null && <p className="ledger-note">{bars.count}</p>}
          {bars.rows.length > 0 && (
            <>
              <p className="ov-ex-head" aria-hidden="true">
                <span>{OVERVIEW_TAB_WORDS.requirement}</span>
                <span>{bars.scale}</span>
              </p>
              <ul className="ov-ex" aria-label={`${OVERVIEW_TAB_WORDS.exposureNote}, ${bars.scale}`}>
                {bars.rows.map((row) => (
                  <li key={row.package}>
                    <TabLink target={{ ...bars.link, pkg: row.package }} className="ov-ex-row">
                      <span className="ov-ex-name">
                        <PkgName name={row.package} />
                      </span>
                      <CountBar value={row.flagged} scale={bars.longest} />
                      <span className="ov-ex-count">
                        {row.flagged}
                        <span className="vh"> {exposureUnit(row.flagged)}</span>
                      </span>
                    </TabLink>
                  </li>
                ))}
              </ul>
            </>
          )}
          {bars.overlap !== null && <p className="ledger-note">{bars.overlap}</p>}
          {bars.more !== null && (
            <p className="ledger-note">
              <TabLink target={bars.link} className="ov-link">
                {bars.more} <span aria-hidden="true">›</span>
              </TabLink>
            </p>
          )}
          {bars.shared !== null && <p className="ledger-note">{bars.shared}</p>}
        </div>
      )}
      {depthPart}
    </div>
  );
}

/** A browser breaks a line after a hyphen, so a "(Y-m-d)" day goes in a span that does not wrap. */
function UnbrokenDays({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\(\d{4}-\d{2}-\d{2}\))/).map((part, at) =>
        at % 2 === 1 ? (
          <span key={at} className="ov-ly-day">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** PD-OVERVIEW-6: the packages furthest behind, each linked to its row. */
function LibyearsTable({ report }: { report: Report2 }) {
  const rows = libyearsTop(report);
  if (rows.length === 0)
    return report.libyears.measured > 0 ? (
      <p className="ledger-note">{OVERVIEW_TAB_WORDS.libyearsNone}</p>
    ) : null;

  return (
    <table className="ov-ly">
      <caption className="eyebrow">{OVERVIEW_TAB_WORDS.libyearsTop}</caption>
      <thead>
        <tr>
          <th scope="col">{OVERVIEW_TAB_WORDS.package}</th>
          <th scope="col" className="num">
            {OVERVIEW_TAB_WORDS.libyears}
          </th>
          <th scope="col">{OVERVIEW_TAB_WORDS.release}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.package}>
            <td>
              <TabLink target={row.link} className="ov-link">
                <PkgName name={row.package} />
              </TabLink>{" "}
              <span className="ov-ly-version">{row.version}</span>
            </td>
            <td className="num" data-label={OVERVIEW_TAB_WORDS.libyears}>
              {row.libyears}
            </td>
            <td className="ov-ly-release" data-label={OVERVIEW_TAB_WORDS.release}>
              <UnbrokenDays text={row.release} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The Overview tab, the default view (PD-OVERVIEW-1, PD-OVERVIEW-2): the lead with the Security
 * summary, then "Weighs most", then Flags beside Libyears, then Blast radius (overview-tab.css). A
 * run with nothing flagged keeps only Libyears below the lead.
 */
export function OverviewView2() {
  const { report } = useReport2();
  const empty = report.packages_checked === 0;
  const clean = report.packages_flagged === 0;

  return (
    <section
      className={`ledger ov${clean ? " is-clean" : ""}`}
      data-surface="overview"
      aria-label={OVERVIEW_WORDS.band}
    >
      <h2 className="vh">{OVERVIEW_TAB_WORDS.overview}</h2>
      <div className="ov-lead">
        <Lead report={report} />
      </div>
      {!empty && (
        <>
          <div className="ov-weighs">
            <WeighsMostBlock report={report} />
          </div>
          <div className="ov-flags">
            <FlagsBlock report={report} />
          </div>
          <div className="ov-libyears">
            <LibyearsBlock report={report}>
              <LibyearsTable report={report} />
            </LibyearsBlock>
          </div>
          <div className="ov-expo">
            <ExposureBlock report={report} />
          </div>
        </>
      )}
    </section>
  );
}
