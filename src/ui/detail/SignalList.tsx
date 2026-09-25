import { Fragment, type ComponentChildren } from "preact";
import type { Finding, Signal } from "../../model/types";
import { checkStrip, checkTally, levelTone, type CheckCell, type CheckState } from "../../domain/checks";
import { annotateThresholds, CHECK_NAMES, DOCS_URL, SIGNAL_DEFS, SIGNAL_DOC } from "../../domain/vocab";
import { OutLink, toneClass } from "../common/common";
import { useReport } from "../context";
import { KeyValue, type KeyValueRow } from "./KeyValue";
import "./detail.css";

/** A scalar the way legacy's dump wrote it (`report.js:716`): `null` spelled out, a string as
 *  itself, a number or boolean as its JSON digits. */
function scalar(value: unknown): string | null {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  return null;
}

/** A list of scalars as "S2, S8"; `null` for anything else. */
function scalarList(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(scalar);
  return items.every((item): item is string => item !== null) ? items.join(", ") : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One flat object as "check release_dates · reason undated_releases · blocks S2, S8", each key in
 *  the muted label colour; a value nested deeper than a list of scalars stays JSON. */
function DataRecord({ record }: { record: Readonly<Record<string, unknown>> }) {
  return (
    <span className="detail-data-item">
      {Object.entries(record).map(([key, value], index) => (
        <Fragment key={key}>
          {index > 0 && " · "}
          <span className="detail-data-key">{key}</span>{" "}
          {scalar(value) ?? scalarList(value) ?? JSON.stringify(value)}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * A signal's `data` value, readable rather than raw: a scalar as legacy wrote it, a list of scalars
 * joined ("S2, S8" rather than `["S2","S8"]`), a list of objects one line per object (S7's
 * packages, S9's advisories, S10's unchecked checks), anything deeper as JSON. Every key and value
 * the document carries is still shown; only the punctuation changes.
 */
function formatDataValue(value: unknown): ComponentChildren {
  const flat = scalar(value) ?? scalarList(value);
  if (flat !== null) return flat;
  if (isRecord(value)) return <DataRecord record={value} />;
  if (Array.isArray(value) && value.every(isRecord)) {
    return value.map((record, index) => <DataRecord key={index} record={record} />);
  }
  return JSON.stringify(value);
}

function signalRows(data: Readonly<Record<string, unknown>>): readonly KeyValueRow[] {
  const entries = Object.entries(data);
  if (entries.length === 0) return [{ label: "—", value: "no data" }];

  return entries.map(([key, value]) => ({ label: key, value: formatDataValue(value) }));
}

/** One cell of the strip: a bar filled in its level's tone when the check fired, outlined when it
 *  stayed quiet, hatched when it could not run, dotted when the document does not say, with the id
 *  under it. The whole strip is `aria-hidden`: the tally and the lines under it say every state in
 *  words, so the cells do nothing a keyboard or a screen reader would need. */
function Cell({ cell }: { cell: CheckCell }) {
  const tone = cell.signal === null ? "" : ` ${toneClass(levelTone(cell.signal.level))}`;
  return (
    <span className={`detail-check is-${cell.state}${tone}`}>
      <i />
      {cell.id}
    </span>
  );
}

/** "Quiet: S5 predates PHP · S6 snapshot", one such line per state that has any cells. */
function StateLine({
  label,
  cells,
  suffix = null,
}: {
  label: string;
  cells: readonly CheckCell[];
  suffix?: string | null;
}) {
  if (cells.length === 0) return null;
  return (
    <p className="detail-checks-line">
      {label}{" "}
      {cells.map((cell, index) => (
        <Fragment key={cell.id}>
          {index > 0 && " · "}
          <span className="detail-checks-id">{cell.id}</span> {CHECK_NAMES[cell.id] ?? ""}
        </Fragment>
      ))}
      {suffix}
    </p>
  );
}

/**
 * One fired check, closed by default: its id in its level's tone, lockrot's own summary and the
 * level in words; opened, what the check looks for (the run's own thresholds filled in), the
 * signal's raw data, and its entry in lockrot's docs. The docs link sits in the body, not the
 * `<summary>`: a summary is itself a control, and a link nested in it is unreachable to assistive
 * tech and fires the disclosure on click.
 */
function FiredRow({ signal }: { signal: Signal }) {
  const { model } = useReport();
  const doc = SIGNAL_DOC[signal.id] ?? `${DOCS_URL}#the-signals`;
  const def = SIGNAL_DEFS[signal.id];

  return (
    <details className={`detail-fired ${toneClass(levelTone(signal.level))}`}>
      <summary className="detail-fired-summary">
        <span className="detail-fired-id">{signal.id}</span>
        <span className="detail-fired-text">{signal.summary}</span>
        <span className="detail-fired-level">{signal.level}</span>
      </summary>
      <div className="detail-fired-body">
        <p className="detail-fired-def">
          {def !== undefined && <>{annotateThresholds(def, model.report.run.thresholds)} </>}
          <OutLink href={doc}>{signal.id} in lockrot’s docs</OutLink>
        </p>
        <KeyValue rows={signalRows(signal.data)} />
      </div>
    </details>
  );
}

function cellsIn(cells: readonly CheckCell[], state: CheckState): readonly CheckCell[] {
  return cells.filter((cell) => cell.state === state);
}

/**
 * "Checks" (PD-DETAIL-12, DESIGN.md §5): a strip of all ten checks, a tally of their states, the
 * quiet and could-not-run ones named in one muted line each, then only the fired ones, highest
 * level first, each expandable into its data. States come from `domain/checks.ts#checkStrip`: the
 * fired signals and S10's own list of the checks it stopped. A finding with no signal at all still
 * gets the strip, then the same explanatory line legacy showed instead of an empty list.
 */
export function SignalList({ finding }: { finding: Finding }) {
  const strip = checkStrip(finding);
  const tally = checkTally(strip);
  const unreported = cellsIn(strip.cells, "unreported");

  return (
    <section className="detail-section detail-checks">
      <h3>
        Checks
        <span className="detail-checks-aside">{strip.counts.fired} of 10 fired</span>
      </h3>
      <div className="detail-strip" aria-hidden="true">
        {strip.cells.map((cell) => (
          <Cell key={cell.id} cell={cell} />
        ))}
      </div>
      <p className="detail-checks-tally">
        <b>{tally[0]}</b>
        {tally.slice(1).map((part) => ` · ${part}`)}
        {strip.unknown.length > 0 && ` · also ${strip.unknown.join(", ")}, a check this page does not know`}.
      </p>
      <StateLine
        label="Could not run:"
        cells={cellsIn(strip.cells, "blocked")}
        suffix={strip.blockedReason === null ? " (see S10)" : ` (${strip.blockedReason}, see S10)`}
      />
      {unreported.length > 0 && (
        <p className="detail-checks-line">
          S10 says a check could not run but not which one, so the other{" "}
          {unreported.length === 1 ? "check is" : `${unreported.length} are`} not reported as quiet.
        </p>
      )}
      <StateLine label="Quiet:" cells={cellsIn(strip.cells, "quiet")} />
      {strip.fired.length === 0 ? (
        <p className="detail-signal-empty">
          No signal fired. The verdict comes from what lockrot could not learn.
        </p>
      ) : (
        <div className="detail-fired-list">
          {strip.fired.map((signal) => (
            <FiredRow key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </section>
  );
}
