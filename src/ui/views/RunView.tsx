import { Fragment } from "preact";
import type { BaselineSummary, LibyearsBlock } from "../../model/types";
import { useReport } from "../context";
import { baselineDelta } from "../../domain/baseline";
import { EMPTY_FILTERS } from "../../state/types";
import { fixed } from "../../domain/format";
import { noteDocLink } from "../../domain/sniff";
import { OutLink, NoWrap } from "../common/common";
import "./views.css";
import "./baseline.css";

/** `null`/missing as an em dash, never `String(undefined)` — DESIGN.md §5 K6: legacy's Run tab
 *  printed the literal word "undefined" for `network_failures`, `not_from_composer_repository` and
 *  `include_dev` when a document carried none of them, and an empty string for `packages_checked`. */
function orDash(value: string | null): string {
  return value ?? "—";
}

type StatBucket = "new" | "worsened" | "known";

/**
 * One of the three counts, as a figure. PD-BASELINE-6: when the findings carry their own baseline
 * state and the Findings tab counts the same number (`baselineDelta`), the figure is a button that
 * lists those findings there — the Since filter alone, nothing else — so a reader on Run data is one
 * press from the rows behind a number. Otherwise (a zero, or a summary block the findings cannot be
 * filtered to) it stays a plain figure.
 */
function Stat({ bucket, label, count }: { bucket: StatBucket; label: string; count: number }) {
  const { model, dispatch } = useReport();
  const delta = baselineDelta(model);
  const listable = delta !== null && delta.filterable && count > 0 && delta[bucket] === count;
  const className = bucket === "known" ? "bl-stat" : "bl-stat bl-change";
  return (
    <div className={className}>
      <dt>{label}</dt>
      <dd>
        {listable ? (
          <button
            type="button"
            className="bl-stat-btn"
            title={`List the ${count} ${label} ${count === 1 ? "finding" : "findings"} on Findings`}
            onClick={() => {
              dispatch({ type: "focus", filters: { ...EMPTY_FILTERS, since: [bucket] } });
            }}
          >
            {count}
          </button>
        ) : (
          count
        )}
      </dd>
    </div>
  );
}

/**
 * PD-BASELINE-4 (DESIGN.md §5): the baseline as a stat row — the four numbers lockrot recorded in
 * its summary block, new and worsened in the baseline's accent as the rows' own tags are
 * (PD-BASELINE-7), then the stale entries by name. lockrot calls those `stale`; the label says
 * "gone from the lock" first, so it never reads as the verdict of the same name. Replaces legacy's
 * raw `JSON.stringify` dump (report.js:651), and the one-line sentence that followed it.
 */
function BaselineStats({ baseline }: { baseline: BaselineSummary }) {
  const stats: readonly (readonly [bucket: StatBucket, label: string, count: number])[] = [
    ["new", "new", baseline.new],
    ["worsened", "worsened", baseline.worsened],
    ["known", "already accepted", baseline.known],
  ];
  return (
    <section className="sect">
      <h3>Against the baseline</h3>
      <p className="bl-run-path">
        Compared with <span className="mono">{baseline.path || "—"}</span>
      </p>
      <dl className="bl-stats">
        {stats.map(([bucket, label, count]) => (
          <Stat key={bucket} bucket={bucket} label={label} count={count} />
        ))}
        <div className="bl-stat bl-stat-gone">
          <dt>gone from the lock (stale)</dt>
          <dd>{baseline.stale.length}</dd>
          {baseline.stale.length > 0 && (
            <dd className="bl-gone">
              <ul className="bl-gone-list" aria-label="Baseline entries no longer in the lock">
                {baseline.stale.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </dd>
          )}
        </div>
      </dl>
    </section>
  );
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

/** A value longer than this takes a line of its own on paper (print.css `.kv-long`), where the facts
 *  sit two pairs to a line. */
const LONG_VALUE = 32;

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
    // With a baseline its own section above says everything this row used to; without one the row
    // still says so, rather than leaving a reader to wonder whether the page just forgot it.
    ...(report.baseline === null ? ([["baseline", "none"]] as const) : []),
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

      {report.baseline !== null && <BaselineStats baseline={report.baseline} />}

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
            {kv.map(([label, value]) => {
              const long = value.length > LONG_VALUE ? "kv-long" : undefined;
              return (
                <Fragment key={label}>
                  <dt className={long}>{label}</dt>
                  <dd className={long}>{value}</dd>
                </Fragment>
              );
            })}
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
