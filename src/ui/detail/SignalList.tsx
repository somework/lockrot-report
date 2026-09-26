import { Fragment, type ComponentChildren } from "preact";
import type { Finding, Signal } from "../../model/types";
import {
  checkName,
  checkStrip,
  checkTally,
  dataLabel,
  identifierPieces,
  levelTone,
  pulledRows,
  timestampParts,
  wrapParts,
  type CheckCell,
  type CheckState,
  type PulledRow,
} from "../../domain/checks";
import { ACTIVITY_CHECKS, quietUnread } from "../../domain/provenance";
import { annotateThresholds, DOCS_URL, SIGNAL_DEFS, SIGNAL_DOC } from "../../domain/vocab";
import { OutLink, toneClass } from "../common/common";
import { PkgMention } from "../common/PkgMention";
import { useReport } from "../context";
import "./detail.css";

/** A scalar the way legacy's dump wrote it (`report.js:716`): `null` spelled out, a string as
 *  itself, a number or boolean as its JSON digits. `DataScalar` draws a single `null` or timestamp
 *  its own way. */
function scalar(value: unknown): string | null {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  return null;
}

/** A list of scalars' texts, or `null` when any item is not a scalar. */
function scalarItems(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(scalar);
  return items.every((item): item is string => item !== null) ? items : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/**
 * Text that wraps between words and, inside a package name, URL, id or date, only after a "/" or
 * "::" (`domain/checks.ts#wrapParts`). Each identifier piece is an inline-block: kept whole on its
 * line while it fits one, wrapped inside only when it alone is wider than the line. `prose` keeps a
 * whole identifier as one piece, for a sentence rather than a narrow data column.
 */
function Wrapped({ text, prose = false }: { text: string; prose?: boolean }) {
  const parts = wrapParts(text, { paths: !prose });
  if (parts.length === 1 && parts[0]?.atomic !== true) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.atomic ? (
          <span key={index} className="detail-token">
            {prose ? <PathPieces token={part.text} /> : part.text}
          </span>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** A whole identifier inside prose, its pieces each kept whole in turn: the outer `detail-token`
 *  keeps the name on one line while it fits, and only a name wider than the line breaks — after its
 *  "/" or "::", never at a hyphen ("package-versions-/deprecated") while a piece fits. */
function PathPieces({ token }: { token: string }) {
  const pieces = identifierPieces(token);
  if (pieces.length === 1) return <>{token}</>;
  return (
    <>
      {pieces.map((piece, index) => (
        <span key={index} className="detail-token">
          {piece}
        </span>
      ))}
    </>
  );
}

/** How a list of scalars is joined: a dependency chain the way the panel's "How it gets in" writes
 *  one ("mautic/core-lib › doctrine/dbal"), any other list with commas ("S2, S8"). */
function joinerFor(key: string): string {
  return key === "chain" ? " › " : ", ";
}

/** A list of scalars, each item's separator kept with it ("S2," then "S8"; "mautic/core-lib ›",
 *  glued by a no-break space that `wrapParts` keeps inside the item's last piece), so a wrapped line
 *  never starts on one. */
function ScalarList({ items, joiner }: { items: readonly string[]; joiner: string }) {
  const glued = joiner.trimEnd().replace(/^ /, "\u00a0");
  return (
    <Wrapped text={items.map((item, index) => (index < items.length - 1 ? item + glued : item)).join(" ")} />
  );
}

/** One object in a signal's data (an S7 package, an S9 advisory, an S10 unchecked check): one line
 *  per field, its label beside its value, the labels of every object in the list sharing one column
 *  (`detail.css`, subgrid). The first field, the object's name, leads in ink. */
function DataRecord({ record }: { record: Readonly<Record<string, unknown>> }) {
  return (
    <dl className="detail-data-item">
      {Object.entries(record).map(([key, value]) => (
        <Fragment key={key}>
          <dt>{dataLabel(key)}</dt>
          <dd>{formatDataValue(value, key)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** A pulled-in package's "via": the hops between the open package and it, or "direct". */
function Via({ hops }: { hops: readonly string[] }) {
  if (hops.length === 0) return <span className="detail-data-null">direct</span>;
  return <ScalarList items={hops} joiner=" › " />;
}

/**
 * S7's flagged packages as one compact table — package · verdict · via — instead of one bordered
 * three-line block each (21 of them ran past 2000px). "Via" is the chain between the open package
 * and the row's package (`checks.ts#pulledRows`); "direct" when there is none. On a narrow sheet the
 * via column folds under each package as a muted second line, left out for a direct one, and the
 * column head says so (`detail.css`); only one of the two is ever displayed, so a screen reader hears
 * it once.
 */
function PulledTable({ rows }: { rows: readonly PulledRow[] }) {
  return (
    <table className="detail-pulled-table">
      <thead>
        <tr>
          <th scope="col">
            package<span className="detail-pulled-via-head">, and its via unless direct</span>
          </th>
          <th scope="col">verdict</th>
          <th scope="col" className="detail-pulled-via">
            via
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.package}>
            <td>
              <PkgMention name={row.package}>
                <Wrapped text={row.package} />
              </PkgMention>
              {row.via.length > 0 && (
                <span className="detail-pulled-via-under">
                  via <Via hops={row.via} />
                </span>
              )}
            </td>
            <td className="detail-pulled-verdict">{row.verdict}</td>
            <td className="detail-pulled-via">
              <Via hops={row.via} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A top-level value: `null` as a muted dash (the word kept for a screen reader), an ISO timestamp
 *  with its date leading and its time quieter, anything else as `scalar` writes it. */
function DataScalar({ value }: { value: string | number | boolean | null }) {
  if (value === null) {
    return (
      <span className="detail-data-null">
        <span aria-hidden="true">—</span>
        <span className="detail-sr">null</span>
      </span>
    );
  }
  if (typeof value !== "string") return <>{scalar(value)}</>;
  const parts = timestampParts(value);
  if (parts === null) return <Wrapped text={value} />;
  return (
    <>
      <span className="detail-data-date">{parts.date}</span>
      <wbr />
      <span className="detail-data-time">{parts.time}</span>
    </>
  );
}

/** Whether a value needs the row's whole width: a list of objects (S7's packages, S9's advisories,
 *  S10's unchecked checks), one object, or anything shown as JSON. */
function isWide(value: unknown): boolean {
  return !isScalar(value) && scalarItems(value) === null;
}

/** Whether a value is drawn as bordered per-field objects. */
function hasRecords(value: unknown): boolean {
  return isRecord(value) || (Array.isArray(value) && value.length > 0 && value.every(isRecord));
}

/**
 * A signal's `data` value, readable rather than raw: a scalar as `DataScalar` draws it, a list of
 * scalars joined ("S2, S8" rather than `["S2","S8"]`), an object or a list of objects one bordered
 * block each, one line per field, anything deeper as JSON. Every key and value the document carries
 * is still shown; only the punctuation changes.
 */
function formatDataValue(value: unknown, key: string, openPackage: string | null = null): ComponentChildren {
  if (isScalar(value)) return <DataScalar value={value} />;
  const pulled = openPackage === null ? null : pulledRows(value, openPackage);
  if (pulled !== null) return <PulledTable rows={pulled} />;
  const items = scalarItems(value);
  if (items !== null) return <ScalarList items={items} joiner={joinerFor(key)} />;
  if (isRecord(value)) return <DataRecord record={value} />;
  if (Array.isArray(value) && value.every(isRecord)) {
    return value.map((record, index) => <DataRecord key={index} record={record} />);
  }
  return JSON.stringify(value);
}

/**
 * A fired signal's data as label/value pairs, each label beside its value (a 40/60 grid) so one
 * check's data costs one line per key, not two; a list of objects takes the full width under its
 * label, at every width (`detail.css`).
 */
function SignalData({ data, pkg }: { data: Readonly<Record<string, unknown>>; pkg: string }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <p className="detail-data-empty">This check carries no data.</p>;
  }
  return (
    <dl className="detail-kv detail-data">
      {entries.map(([key, value]) => {
        const wide = isWide(value) ? "is-wide" : undefined;
        const table = pulledRows(value, pkg) !== null;
        const ddClass = hasRecords(value) && !table ? "is-wide has-records" : wide;
        return (
          <Fragment key={key}>
            <dt className={wide}>{dataLabel(key)}</dt>
            <dd className={ddClass}>{formatDataValue(value, key, pkg)}</dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

/** The id a fired check's row carries, so a strip cell can point at it. */
export function firedRowId(id: string): string {
  return `detail-sig-${id}`;
}

/** The Provenance section's repository-activity facts (Detail.tsx), a quiet S3's or S4's evidence. */
export const ACTIVITY_FACTS_ID = "detail-prov-activity";

/**
 * Where a cell's evidence sits in the open panel, or `null` when it has none to point at: a fired
 * check's own row; a check that could not run, S10's row (which names it); a quiet S3 (archived) or
 * S4 (push age), Provenance's repository-activity line — the facts it read, or why this file holds
 * none, which is always drawn.
 */
function evidenceTarget(cell: CheckCell, s10Fired: boolean): string | null {
  if (cell.state === "fired") return firedRowId(cell.id);
  if (cell.state === "blocked") return s10Fired ? firedRowId("S10") : null;
  if (cell.state === "quiet" && ACTIVITY_CHECKS.includes(cell.id)) return ACTIVITY_FACTS_ID;
  return null;
}

/** What a cell's state is called when its button is read out. */
const STATE_WORDS: Readonly<Record<CheckState, string>> = {
  fired: "fired",
  quiet: "quiet",
  blocked: "could not run",
  unreported: "not reported",
};

/** Opens every `<details>` around the evidence (and the evidence itself when it is one), brings it
 *  into view and moves focus to it — a focusable facts line itself, otherwise its summary — so the
 *  reader lands where the strip pointed. */
function reveal(id: string): void {
  const target = document.getElementById(id);
  if (target === null) return;
  if (target instanceof HTMLDetailsElement) target.open = true;
  for (let d = target.parentElement?.closest("details"); d; d = d.parentElement?.closest("details")) {
    d.open = true;
  }
  const reduce =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  // A plain evidence line (Provenance's activity facts) takes focus itself, so a screen reader
  // reads the facts rather than the section's heading.
  if (!(target instanceof HTMLDetailsElement) && target.hasAttribute("tabindex")) {
    target.focus({ preventScroll: true });
    return;
  }
  const owner = target instanceof HTMLDetailsElement ? target : target.closest("details");
  const summary = owner?.querySelector<HTMLElement>(":scope > summary") ?? null;
  summary?.focus({ preventScroll: true });
}

/** One cell of the strip: a bar filled in its level's tone when the check fired, outlined when it
 *  stayed quiet (dashed when a quiet S3/S4 has no repository activity on file), hatched when it
 *  could not run, dotted when the document does not say, with the id
 *  and the check's one- or two-word name under it. A cell with evidence in the panel (PD-RUN-5) is a
 *  button that opens it and moves there; every other cell is hidden from assistive tech, since the
 *  tally and the lines under the strip say every state in words. */
function Cell({ cell, target, unread }: { cell: CheckCell; target: string | null; unread: boolean }) {
  const tone = cell.signal === null ? "" : ` ${toneClass(levelTone(cell.signal.level))}`;
  const className = `detail-check is-${cell.state}${tone}${unread ? " is-unread" : ""}`;
  const body = (
    <>
      <i aria-hidden="true" />
      <span className="detail-check-id">{cell.id}</span>
      <span className="detail-check-name">{checkName(cell)}</span>
    </>
  );
  if (target === null) {
    return (
      <span className={className} aria-hidden="true">
        {body}
      </span>
    );
  }
  const label = unread
    ? `${cell.id} ${checkName(cell)}, quiet with no repository activity in this file: show why`
    : `${cell.id} ${checkName(cell)}, ${STATE_WORDS[cell.state]}: show the evidence`;
  return (
    <button
      type="button"
      className={`${className} is-linked`}
      aria-label={label}
      title={label}
      onClick={() => {
        reveal(target);
      }}
    >
      {body}
    </button>
  );
}

/**
 * "Quiet: S5 · S6 · S8", one such line per state that has any cells. The ids alone are shown: the
 * strip right above already names each check, and saying every name twice doubled the block's
 * weight. The names stay in the line for a screen reader ("S5 predates PHP"), since the strip is
 * hidden from it. Each " ·" belongs to the item before it, so a wrapped line never starts on one.
 */
function StateLine({
  label,
  cells,
  suffix = null,
}: {
  label: string;
  cells: readonly CheckCell[];
  suffix?: ComponentChildren;
}) {
  if (cells.length === 0) return null;
  return (
    <p className="detail-checks-line">
      {label}{" "}
      {cells.map((cell, index) => (
        <Fragment key={cell.id}>
          <span className="detail-checks-item">
            <span className="detail-checks-id">{cell.id}</span>
            <span className="detail-sr"> {checkName(cell)}</span>
            {index < cells.length - 1 && " ·"}
          </span>
          {index < cells.length - 1 && " "}
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
function FiredRow({ signal, pkg }: { signal: Signal; pkg: string }) {
  const { model } = useReport();
  const doc = SIGNAL_DOC[signal.id] ?? `${DOCS_URL}#the-signals`;
  const def = SIGNAL_DEFS[signal.id];

  return (
    <details id={firedRowId(signal.id)} className={`detail-fired ${toneClass(levelTone(signal.level))}`}>
      <summary className="detail-fired-summary">
        <span className="detail-fired-id">{signal.id}</span>
        <span className="detail-fired-text">
          <Wrapped text={signal.summary} prose />
        </span>
        <span className="detail-fired-level">{signal.level}</span>
      </summary>
      <div className="detail-fired-body">
        <p className="detail-fired-def">
          {def !== undefined && (
            <>
              <Wrapped text={annotateThresholds(def, model.report.run.thresholds)} prose />{" "}
            </>
          )}
          <OutLink href={doc}>{signal.id} in lockrot’s docs</OutLink>
        </p>
        <SignalData data={signal.data} pkg={pkg} />
      </div>
    </details>
  );
}

function cellsIn(cells: readonly CheckCell[], state: CheckState): readonly CheckCell[] {
  return cells.filter((cell) => cell.state === state);
}

/**
 * "Checks" (PD-DETAIL-12, DESIGN.md §5): a strip of all ten checks, a tally of their states, the
 * quiet and could-not-run ones listed by id in one muted line each, then only the fired ones, highest
 * level first, each expandable into its data. States come from `domain/checks.ts#checkStrip`: the
 * fired signals and S10's own list of the checks it stopped. A finding with no signal at all still
 * gets the strip, then the same explanatory line legacy showed instead of an empty list.
 */
export function SignalList({ finding }: { finding: Finding }) {
  const { model } = useReport();
  const strip = checkStrip(finding);
  const unread = quietUnread(model, finding);
  const unreadIds = new Set(unread?.ids ?? []);
  const s10Fired = strip.fired.some((signal) => signal.id === "S10");
  const targets = strip.cells.map((cell) => evidenceTarget(cell, s10Fired));
  const linked = targets.some((target) => target !== null);
  const tally = checkTally(strip, unreadIds.size);
  const unreported = cellsIn(strip.cells, "unreported");
  const quiet = cellsIn(strip.cells, "quiet");

  return (
    <section className="detail-section detail-checks">
      <h3>Checks</h3>
      <div
        className="detail-strip"
        role={linked ? "group" : undefined}
        aria-label={linked ? "Checks with evidence in this panel" : undefined}
        aria-hidden={linked ? undefined : "true"}
      >
        {strip.cells.map((cell, index) => (
          <Cell key={cell.id} cell={cell} target={targets[index] ?? null} unread={unreadIds.has(cell.id)} />
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
      <StateLine label="Quiet:" cells={quiet.filter((cell) => !unreadIds.has(cell.id))} />
      {unread !== null && (
        <StateLine
          label="Quiet with no repository activity in this file:"
          cells={quiet.filter((cell) => unreadIds.has(cell.id))}
          suffix={
            <>
              {" "}
              — {unread.because}.{" "}
              <button
                type="button"
                className="detail-checks-link"
                onClick={() => {
                  reveal(ACTIVITY_FACTS_ID);
                }}
              >
                See Provenance
              </button>
            </>
          }
        />
      )}
      {strip.fired.length === 0 ? (
        <p className="detail-signal-empty">
          No signal fired. The verdict comes from what lockrot could not learn.
        </p>
      ) : (
        <div className="detail-fired-list">
          {strip.fired.map((signal) => (
            <FiredRow key={signal.id} signal={signal} pkg={finding.package} />
          ))}
        </div>
      )}
    </section>
  );
}
