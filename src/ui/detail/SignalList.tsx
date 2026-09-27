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
  s10ReasonWords,
  timestampParts,
  wrapParts,
  type CheckCell,
  type CheckState,
  type CheckStrip,
  type PulledRow,
} from "../../domain/checks";
import { ACTIVITY_CHECKS, quietUnread } from "../../domain/provenance";
import { annotateThresholds, signalDef, signalDocUrl } from "../../domain/vocab";
import { OutLink, toneClass } from "../common/common";
import { PkgMention } from "../common/PkgMention";
import { useReport } from "../context";
import "./detail.css";

/** `null` spelled out, a string as itself, a number or boolean as its JSON. */
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

/** Each identifier piece is an inline-block, so it wraps only when it alone is wider than the line;
 *  `prose` keeps a whole identifier as one piece. */
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

/** Only a name wider than the line breaks, after "/" or "::", never at a hyphen. */
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

function joinerFor(key: string): string {
  return key === "chain" ? " › " : ", ";
}

/** Each separator is kept with its item, so a wrapped line never starts on one. */
function ScalarList({ items, joiner }: { items: readonly string[]; joiner: string }) {
  const glued = joiner.trimEnd().replace(/^ /, "\u00a0");
  return (
    <Wrapped text={items.map((item, index) => (index < items.length - 1 ? item + glued : item)).join(" ")} />
  );
}

/** The labels of every object in the list share one column (subgrid). */
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

/** S7's packages as one table: one bordered block each ran past 2000px. On a narrow sheet "via"
 *  folds under each package; only one of the two is displayed, so a screen reader hears it once. */
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

function isWide(value: unknown): boolean {
  return !isScalar(value) && scalarItems(value) === null;
}

/** Whether a value is drawn as bordered per-field objects. */
function hasRecords(value: unknown): boolean {
  return isRecord(value) || (Array.isArray(value) && value.length > 0 && value.every(isRecord));
}

/** Every key and value is shown; only the punctuation changes. */
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

/** A quiet S3 or S4 points at Provenance's activity line, which is always drawn. */
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

/** How many frames `settle` keeps re-aiming at the evidence after the first jump. */
const SETTLE_FRAMES = 3;

/** Scrolling can reveal the footer, which shortens the side panel a frame later; aiming again for a
 *  few frames lands inside the settled panel (WebKit). */
function settle(target: Element, frames: number): void {
  if (frames <= 0 || typeof window.requestAnimationFrame !== "function") return;
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ block: "nearest" });
    settle(target, frames - 1);
  });
}

function reveal(id: string): void {
  const target = document.getElementById(id);
  if (target === null) return;
  if (target instanceof HTMLDetailsElement) target.open = true;
  for (let d = target.parentElement?.closest("details"); d; d = d.parentElement?.closest("details")) {
    d.open = true;
  }
  // A frame later and an instant jump: Firefox and WebKit each dropped one of the two smooth
  // scrolls started while the <details> were still being laid out.
  const land = (): void => {
    target.scrollIntoView({ block: "nearest" });
    settle(target, SETTLE_FRAMES);
    // So a screen reader reads the facts rather than the section's heading.
    if (!(target instanceof HTMLDetailsElement) && target.hasAttribute("tabindex")) {
      target.focus({ preventScroll: true });
      return;
    }
    const owner = target instanceof HTMLDetailsElement ? target : target.closest("details");
    const summary = owner?.querySelector<HTMLElement>(":scope > summary") ?? null;
    summary?.focus({ preventScroll: true });
  };
  if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(land);
  else land();
}

/** A browser offers no break after "/": "snapshot/untagged" must split there to fit a 55px cell. */
function breakAfterSlash(name: string): ComponentChildren {
  const parts = name.split("/");
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </Fragment>
  ));
}

/** Only a cell with evidence in the panel is a button; the others are hidden from assistive tech,
 *  since the lines under the strip say every state in words. */
function Cell({ cell, target, unread }: { cell: CheckCell; target: string | null; unread: boolean }) {
  const tone = cell.signal === null ? "" : ` ${toneClass(levelTone(cell.signal.level))}`;
  const className = `detail-check is-${cell.state}${tone}${unread ? " is-unread" : ""}`;
  const body = (
    <>
      <i aria-hidden="true" />
      <span className="detail-check-id">{cell.id}</span>
      <span className="detail-check-name">{breakAfterSlash(checkName(cell))}</span>
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

/** Ids only: the strip above names each check. The names stay for a screen reader, from which the
 *  strip is hidden. */
function StateLine({
  label,
  cells,
  extra = [],
  suffix = null,
}: {
  label: string;
  cells: readonly CheckCell[];
  extra?: readonly string[];
  suffix?: ComponentChildren;
}) {
  const items = [
    ...cells.map((cell) => ({
      key: cell.id,
      body: (
        <>
          <span className="detail-checks-id">{cell.id}</span>
          <span className="detail-sr"> {checkName(cell)}</span>
        </>
      ),
    })),
    ...extra.map((id) => ({ key: `extra-${id}`, body: <code className="detail-checks-id">{id}</code> })),
  ];
  if (items.length === 0) return null;
  return (
    <p className="detail-checks-line">
      {label}{" "}
      {items.map((item, index) => (
        <Fragment key={item.key}>
          <span className="detail-checks-item">
            {item.body}
            {index < items.length - 1 && " ·"}
          </span>
          {index < items.length - 1 && " "}
        </Fragment>
      ))}
      {suffix}
    </p>
  );
}

/** Ids this page does not know, each as written in code, joined as a sentence lists them. */
function CodeList({ ids }: { ids: readonly string[] }) {
  return (
    <>
      {ids.map((id, index) => (
        <Fragment key={id}>
          {index > 0 && ", "}
          <code>{id}</code>
        </Fragment>
      ))}
    </>
  );
}

function UnknownFired({ ids }: { ids: readonly string[] }) {
  if (ids.length === 0) return null;
  return (
    <>
      {" · also "}
      <CodeList ids={ids} />
      {ids.length === 1 ? ", a check this page does not know" : ", checks this page does not know"}
    </>
  );
}

function BlockedSuffix({ strip }: { strip: CheckStrip }) {
  const reasons = strip.blockedReasons;
  if (reasons.length === 0) return <> (see S10)</>;
  return (
    <>
      {" ("}
      {reasons.map((reason, index) => (
        <Fragment key={reason.raw}>
          {index > 0 && " and "}
          {reason.known ? s10ReasonWords(reason) : <code>{s10ReasonWords(reason)}</code>}
        </Fragment>
      ))}
      {", see S10)"}
    </>
  );
}

/** A longer id, which only an unknown one can be, widens the column instead of overrunning it. */
const WIDE_ID = 3;

/** The docs link sits in the body: a link nested in a <summary> is unreachable to assistive tech
 *  and toggles the disclosure. */
function FiredRow({ signal, pkg }: { signal: Signal; pkg: string }) {
  const { model } = useReport();
  const doc = signalDocUrl(signal.id);
  const def = signalDef(signal.id);

  return (
    <details id={firedRowId(signal.id)} className={`detail-fired ${toneClass(levelTone(signal.level))}`}>
      <summary className={`detail-fired-summary${signal.id.length > WIDE_ID ? " has-wide-id" : ""}`}>
        <span className="detail-fired-id">{signal.id}</span>
        <span className="detail-fired-text">
          <Wrapped text={signal.summary} prose />
        </span>
        <span className="detail-fired-level">{signal.level}</span>
      </summary>
      <div className="detail-fired-body">
        <p className="detail-fired-def">
          <Wrapped text={annotateThresholds(def, model.report.run.thresholds)} prose />
          {doc !== null && (
            <>
              {" "}
              <OutLink href={doc}>{signal.id} in lockrot’s docs</OutLink>
            </>
          )}
        </p>
        <SignalData data={signal.data} pkg={pkg} />
      </div>
    </details>
  );
}

/** "what lockrot could not learn" holds for `unknown` only; any other verdict gets no reason it
 *  cannot back. */
function noSignalLine(verdict: string): string {
  if (verdict === "unknown") return "No signal fired. The verdict comes from what lockrot could not learn.";
  if (verdict === "ok") return "No signal fired: every check ran and found nothing.";
  if (verdict === "finished") return "No signal fired. The verdict comes from the allowlist.";
  return "No signal fired.";
}

function cellsIn(cells: readonly CheckCell[], state: CheckState): readonly CheckCell[] {
  return cells.filter((cell) => cell.state === state);
}

/** "Checks" (PD-DETAIL-12): the strip, a tally, the quiet and could-not-run ids, then the fired
 *  checks, highest level first. */
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
        <UnknownFired ids={strip.unknown} />.
      </p>
      <StateLine
        label="Could not run:"
        cells={cellsIn(strip.cells, "blocked")}
        extra={strip.blockedUnknown}
        suffix={<BlockedSuffix strip={strip} />}
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
        <p className="detail-signal-empty">{noSignalLine(finding.verdict)}</p>
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
