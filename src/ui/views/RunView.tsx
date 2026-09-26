import { Fragment } from "preact";
import type { BaselineSummary, Model, ReportModel } from "../../model/types";
import { useReport } from "../context";
import { baselineDelta } from "../../domain/baseline";
import { EMPTY_FILTERS } from "../../state/types";
import { fixed, plural } from "../../domain/format";
import { noteDocLink } from "../../domain/sniff";
import {
  cacheAge,
  cacheNullReason,
  carries,
  NOT_IN_DOCUMENT,
  NOT_RECORDED,
  nullReason,
  replacementInWordsOnly,
  utcMinute,
} from "../../domain/run";
import { RunAnswer } from "./RunAnswer";
import { RunThresholds } from "./RunThresholds";
import { OutLink, NoWrap } from "../common/common";
import "./views.css";
import "./baseline.css";
import "./run.css";

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

/** A value the document does not give: why, in words, never a bare em dash (PD-RUN-4). */
interface Missing {
  readonly missing: string;
}
/** A value in short parts ("2026-09-23 12:00 UTC" · "24 hours before the run"): each kept whole on
 *  its line, wrapping only between parts, never inside one. */
interface Parts {
  readonly parts: readonly (string | Missing | Aside)[];
}
/** A part that qualifies the value before it ("24 hours before the run"): quieter, in the sans. */
interface Aside {
  readonly aside: string;
}
type FieldValue = string | Missing | Parts;

function isMissing(value: FieldValue): value is Missing {
  return typeof value !== "string" && "missing" in value;
}

/** `value` as text, or the reason the document gives none for `key`. */
function orReason(report: ReportModel, key: string, value: string | null): FieldValue {
  return value ?? { missing: nullReason(report, key) };
}

/** The "libyears not measured" row: every reason with at least one package under it, as a readable
 *  `reason count · reason count` list instead of a raw object dump (legacy `Object.keys`,
 *  report.js:648-650). */
function unmeasuredText(report: ReportModel): FieldValue {
  const block = report.libyears;
  if (!block) return { missing: libyearsReason(report) };
  const parts = block.unmeasured
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason.replace(/_/g, " ")} ${count}`);

  return parts.length > 0 ? { parts } : "none";
}

/** Why there is no libyears figure: the key is absent, lockrot wrote it as null (the run did not
 *  report libyears), or the block is there but measured nothing. */
function libyearsReason(report: ReportModel): string {
  if (!carries(report, "libyears")) return NOT_IN_DOCUMENT;
  if (report.libyears === null) return "not reported by this run";
  return report.libyears.measured === 0 ? "nothing measured" : NOT_RECORDED;
}

function libyearsFigure(report: ReportModel, value: number | null | undefined): FieldValue {
  const ly = report.libyears;
  const text = ly && ly.measured ? fixed(value, 2) : null;
  return text ?? { missing: libyearsReason(report) };
}

/** "none", or "yes" with what the document can say about it: lockrot records whether a lookup
 *  failed, not how many did, and the run's notes above name them. */
function networkText(report: ReportModel): FieldValue {
  if (report.networkFailures === null) return { missing: nullReason(report, "network_failures") };
  if (!report.networkFailures) return "none";
  const notes = report.notes.length;
  return {
    parts: [
      "yes",
      { missing: "no count recorded" },
      ...(notes > 0 ? [{ aside: `${plural(notes, "note", "notes")} above` }] : []),
    ],
  };
}

/** "0 of 21", then — when some abandoned findings name a successor only in words — how many, so the
 *  count never reads as a contradiction of a panel that quotes one (`replacementInWordsOnly`). */
function abandonedText(model: Model): FieldValue {
  const { report } = model;
  if (!report.abandoned) return { missing: nullReason(report, "abandoned") };
  const count = `${report.abandoned.withReplacement} of ${report.abandoned.total}`;
  const inWords = replacementInWordsOnly(model);
  if (inWords === 0) return count;
  return {
    parts: [count, { aside: `${inWords} more named in words only` }],
  };
}

interface Field {
  readonly label: string;
  readonly value: FieldValue;
}

interface FieldGroup {
  readonly title: string;
  readonly fields: readonly Field[];
}

/** The run's every recorded field, in three groups: what it was told, what it could reach, what it
 *  measured. A field the document does not give says why instead of an em dash. */
function fieldGroups(model: Model): readonly FieldGroup[] {
  const { report } = model;
  const { run } = report;
  const ly = report.libyears;
  const cache = cacheAge(report);
  const failOn: FieldValue =
    run.failOn === null ? { missing: nullReason(report, "run.fail_on") } : run.failOn;
  return [
    {
      title: "What it was told",
      fields: [
        { label: "lockrot", value: orReason(report, "lockrot.version", report.tool.version) },
        {
          label: "report schema",
          value: report.tool.schema === null ? { missing: NOT_IN_DOCUMENT } : String(report.tool.schema),
        },
        { label: "generated", value: utcMinute(report.generatedAt) },
        { label: "project", value: orReason(report, "run.project", run.project) },
        { label: "lock file", value: orReason(report, "run.lock_file", run.lockFile) },
        { label: "target PHP", value: orReason(report, "run.target_php", run.targetPhp) },
        {
          label: "include dev",
          value:
            report.includeDev === null
              ? { missing: nullReason(report, "include_dev") }
              : report.includeDev
                ? "yes"
                : "no",
        },
        // PD-SUMMARY-3: "none" only when the run said --fail-on=none; a document without
        // run.fail_on says so in words.
        { label: "fail-on", value: failOn },
      ],
    },
    {
      title: "What it could reach",
      fields: [
        {
          label: "packages checked",
          value: orReason(
            report,
            "packages_checked",
            report.packagesChecked === null ? null : String(report.packagesChecked),
          ),
        },
        {
          label: "network failures",
          value: networkText(report),
        },
        {
          label: "oldest activity cache",
          value:
            cache === null
              ? { missing: cacheNullReason(model) }
              : cache.before === null
                ? utcMinute(cache.oldest)
                : { parts: [utcMinute(cache.oldest), { aside: `${cache.before} before the run` }] },
        },
        {
          label: "not from a Composer repository",
          value: orReason(
            report,
            "not_from_composer_repository",
            report.notFromComposerRepository === null ? null : String(report.notFromComposerRepository),
          ),
        },
      ],
    },
    {
      title: "What it measured",
      fields: [
        {
          label: "abandoned with a replacement",
          value: abandonedText(model),
        },
        { label: "libyears behind", value: libyearsFigure(report, ly?.total) },
        { label: "libyears, direct requirements", value: libyearsFigure(report, ly?.directRequirements) },
        {
          label: "libyears measured",
          value: ly
            ? report.packagesChecked !== null
              ? `${ly.measured} of ${report.packagesChecked}`
              : String(ly.measured)
            : { missing: libyearsReason(report) },
        },
        { label: "libyears not measured", value: unmeasuredText(report) },
        // With a baseline its own section above says everything this row used to; without one the
        // row still says so, rather than leaving a reader to wonder whether the page just forgot it.
        ...(report.baseline === null
          ? [
              {
                label: "baseline",
                value: carries(report, "baseline") ? "none" : { missing: NOT_IN_DOCUMENT },
              },
            ]
          : []),
      ],
    },
  ];
}

/** "19:17 UTC" held together, so a narrow column breaks a timestamp after its date, not before its
 *  zone. */
function keepZone(text: string): string {
  return text.replace(/ UTC$/, "\u00a0UTC");
}

function partClass(part: string | Missing | Aside): string {
  if (typeof part === "string") return "";
  return "missing" in part ? " run-null" : " run-aside";
}

function FieldValueText({ value }: { value: FieldValue }) {
  if (typeof value === "string") return <>{value}</>;
  if (isMissing(value)) return <span className="run-null">{value.missing}</span>;
  // Each part whole on its line; the " ·" belongs to the part before it, so a wrapped line never
  // starts on one.
  return (
    <>
      {value.parts.map((part, index) => {
        const last = index === value.parts.length - 1;
        return (
          <Fragment key={index}>
            <span className={`run-part${partClass(part)}`}>
              {typeof part === "string" ? keepZone(part) : "missing" in part ? part.missing : part.aside}
              {!last && " ·"}
            </span>
            {!last && " "}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * The Run tab (PD-RUN-1..4, DESIGN.md §5): the run in a sentence, what the document leaves out, what
 * the run could not see, the baseline, the thresholds on the Findings list's own scale, then every
 * recorded field in three dense groups — ported from legacy `viewRun` (report.js:627-662).
 */
export function RunView() {
  const { model } = useReport();
  const { report } = model;

  return (
    <div className="run-sections">
      <RunAnswer />

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

      <RunThresholds />

      <section className="sect">
        <h3>Every recorded field</h3>
        <div className="run-fields">
          {fieldGroups(model).map((group) => (
            <div className="run-field-group" key={group.title}>
              <h4 className="run-field-title">{group.title}</h4>
              <dl className="kv run-kv">
                {group.fields.map(({ label, value }) => (
                  <Fragment key={label}>
                    <dt>{label}</dt>
                    <dd>
                      <FieldValueText value={value} />
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <p className="run-footer">
          This document validates against <OutLink href={report.schemaUrl}>{report.schemaUrl}</OutLink>.{" "}
          <OutLink href="https://lockrot.dev/internals/">How lockrot fetches and caches metadata</OutLink>
        </p>
      </section>
    </div>
  );
}
