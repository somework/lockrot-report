import { OVERVIEW_WORDS } from "../../domain/overviewBand";
import { exposureBars, exposureUnit, libyearsTop, OVERVIEW_TAB_WORDS } from "../../domain/overviewTab";
import { loadLine, weighsMost, WEIGHS_WORDS, type WeighsRow } from "../../domain/projectGrade";
import { verdictTone } from "../../domain/findingRow";
import type { Report2 } from "../../model/report";
import { toneClass } from "../common/common";
import { FlagsBlock, Lead, LibyearsBlock, SecurityBlock } from "./Overview";
import { TabLink } from "./TabLink";
import { useReport2 } from "./useReport";
import "./overview-tab.css";

type ScoreModel = Report2["run"]["score_model"];

/** The segments of one row, on the shared `bar_max` scale; each takes its flag's fill. */
function WeighsBar({ row }: { row: WeighsRow }) {
  return (
    <span className={row.over ? "wm-bar is-over" : "wm-bar"} aria-hidden="true">
      {row.segments.map((segment, i) => (
        <span
          key={`${String(i)}-${segment.flag}`}
          className={segment.cut ? "wm-seg is-cut" : "wm-seg"}
          data-flag={segment.flag}
          style={{ width: `max(var(--wm-seg-min), ${String(segment.width * 100)}%)` }}
        />
      ))}
    </span>
  );
}

function WeighsItem({ row, model }: { row: WeighsRow; model: ScoreModel }) {
  return (
    <li className="wm-row">
      <span className="wm-label">
        <TabLink target={row.link} className="ov-link wm-pkg">
          {row.package}
        </TabLink>{" "}
        <span className={`ov-ly-grade ${toneClass(verdictTone(model, row.grade))}`}>{row.grade}</span>{" "}
        <span className="vh">
          {row.total} {row.unit}
        </span>
        {row.reach.length > 0 && <span className="wm-reach"> {row.reach.join(" · ")}</span>}
      </span>
      <span className="wm-total" aria-hidden="true">
        {row.total}
      </span>
      <WeighsBar row={row} />
      <span className="wm-text">{row.text}</span>
    </li>
  );
}

/** "Weighs most" (SPEC §7.9.4): the load line, then the highest scores as ranked bars by term. */
function WeighsMostBlock({ report }: { report: Report2 }) {
  const chart = weighsMost(report);
  const load = loadLine(report);
  if (chart === null || load === null) return null;

  return (
    <div className="ledger-block wm">
      <h3 className="eyebrow ledger-head">
        {WEIGHS_WORDS.head}{" "}
        {chart.rows.length > 0 && <span className="ledger-head-note">{WEIGHS_WORDS.note}</span>}
      </h3>
      <p className="wm-load">{load}</p>
      {chart.legend.length > 0 && (
        <ul className="wm-legend" aria-label={WEIGHS_WORDS.legend}>
          {chart.legend.map((flag) => (
            <li key={flag} className="wm-key">
              <i className="wm-swatch" data-flag={flag} aria-hidden="true" />
              {flag}
            </li>
          ))}
        </ul>
      )}
      {chart.rows.length > 0 && (
        <ol className="wm-list">
          {chart.rows.map((row) => (
            <WeighsItem key={row.package} row={row} model={report.run.score_model} />
          ))}
        </ol>
      )}
      {chart.rest !== null && (
        <p className="ledger-note">
          <TabLink target={chart.restLink} className="ov-link">
            {chart.rest} <span aria-hidden="true">›</span>
          </TabLink>
        </p>
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
      <h3 className="eyebrow ledger-head">
        {OVERVIEW_TAB_WORDS.exposure}{" "}
        <span className="ledger-head-note">{OVERVIEW_TAB_WORDS.exposureNote}</span>
      </h3>
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
                {row.package}
              </TabLink>{" "}
              <span className="ov-ly-version">{row.version}</span>
            </td>
            <td className="num">{row.libyears}</td>
            <td className="ov-ly-release">{row.release}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The Overview tab, the default view (PD-OVERVIEW-1, PD-OVERVIEW-2): the lead, then the flags,
 * Security, Weighs most, exposure and Libyears in that reading order. From 760px a grid sets them
 * in columns (overview-tab.css). Paper prints the same content as its summary section.
 */
export function OverviewView2() {
  const { report } = useReport2();
  const empty = report.packages_checked === 0;

  return (
    <section className="ledger ov" data-surface="overview" aria-label={OVERVIEW_WORDS.band}>
      <h2 className="vh">{OVERVIEW_TAB_WORDS.overview}</h2>
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
          <div className="ov-weighs">
            <WeighsMostBlock report={report} />
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
