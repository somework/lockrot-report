import { Fragment } from "preact";
import type { BaselineSummary, LibyearsBlock } from "../../model/types";
import { useReport } from "../context";
import { fixed } from "../../domain/format";
import { noteDocLink } from "../../domain/sniff";
import { OutLink, NoWrap } from "../common/common";
import "./views.css";

/** `null`/missing as an em dash, never `String(undefined)` — DESIGN.md §5 K6: legacy's Run tab
 *  printed the literal word "undefined" for `network_failures`, `not_from_composer_repository` and
 *  `include_dev` when a document carried none of them, and an empty string for `packages_checked`. */
function orDash(value: string | null): string {
  return value ?? "—";
}

/** The baseline row as a short, readable sentence instead of legacy's raw `JSON.stringify` dump
 *  (report.js:651) — the counts the totals block already gives, plus the stale package names when
 *  there are any. */
function baselineText(baseline: BaselineSummary | null): string {
  if (!baseline) return "none";
  const counts = `${baseline.known} known, ${baseline.new} new, ${baseline.worsened} worsened, ${baseline.stale.length} stale`;
  const summary = `${baseline.path} — ${counts}`;

  return baseline.stale.length > 0 ? `${summary} (${baseline.stale.join(", ")})` : summary;
}

/** The "libyears not measured" row: every reason with at least one package under it, as a readable
 *  `reason count · reason count` list instead of a raw object dump (legacy `Object.keys`,
 *  report.js:648-650). */
function unmeasuredText(block: LibyearsBlock | null): string {
  if (!block) return "—";
  const parts = block.unmeasured
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason.replace(/_/g, " ")} ${count}`);

  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** The Run tab: what the run was told to do, and what it saw — ported from legacy `viewRun`
 *  (report.js:627-662). */
export function RunView() {
  const { model } = useReport();
  const { report } = model;
  const ly = report.libyears;

  const thresholds = report.run.thresholds;
  const kv: readonly (readonly [string, string])[] = [
    ["lockrot", `${report.tool.version ?? "?"} (report schema ${report.tool.schema ?? "?"})`],
    ["generated", report.generatedAt],
    ["packages checked", orDash(report.packagesChecked === null ? null : String(report.packagesChecked))],
    ["include dev", orDash(report.includeDev === null ? null : String(report.includeDev))],
    // orDash, not `?? "none"`: a document that predates run.fail_on left it null, and that is not
    // the same fact as a run explicitly told --fail-on=none (PD-SUMMARY-3, DESIGN.md §5).
    ["fail-on", orDash(report.run.failOn)],
    ["oldest activity cache", orDash(report.activityCacheOldestAt)],
    ["network failures", orDash(report.networkFailures === null ? null : String(report.networkFailures))],
    [
      "not from a Composer repository",
      orDash(report.notFromComposerRepository === null ? null : String(report.notFromComposerRepository)),
    ],
    [
      "abandoned with a replacement",
      report.abandoned ? `${report.abandoned.withReplacement} of ${report.abandoned.total}` : "—",
    ],
    ["libyears behind", orDash(ly && ly.measured ? fixed(ly.total, 2) : null)],
    ["libyears, direct requirements", orDash(ly && ly.measured ? fixed(ly.directRequirements, 2) : null)],
    ["libyears measured", ly ? String(ly.measured) : "—"],
    ["libyears not measured", unmeasuredText(ly)],
    ["baseline", baselineText(report.baseline)],
  ];

  return (
    <div className="run-sections">
      {report.notes.length > 0 && (
        <section className="sect">
          <h3>What this run could not see</h3>
          {report.notes.map((note) => (
            <div className="note" key={note}>
              {note}{" "}
              <NoWrap>
                <OutLink href={noteDocLink(note)}>what this means</OutLink>
              </NoWrap>
            </div>
          ))}
        </section>
      )}

      <section className="sect">
        <h3>Thresholds in force</h3>
        <div className="tablewrap kv-wrap">
          <dl className="kv">
            {thresholds.map(([name, years]) => (
              <Fragment key={name}>
                <dt>{name}</dt>
                <dd>{years} years</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </section>

      <section className="sect">
        <h3>Run</h3>
        <div className="tablewrap kv-wrap">
          <dl className="kv">
            {kv.map(([label, value]) => (
              <Fragment key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
        <p className="run-footer">
          This document validates against <OutLink href={report.schemaUrl}>{report.schemaUrl}</OutLink>.{" "}
          <OutLink href="https://lockrot.dev/internals/">How lockrot fetches and caches metadata</OutLink>
        </p>
      </section>
    </div>
  );
}
