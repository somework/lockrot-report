import type { Finding, Signal, SignalLevel } from "../../model/types";
import { DOCS_URL, SIGNAL_DEFS, SIGNAL_DOC, type Tone } from "../../domain/vocab";
import { KeyValue, type KeyValueRow } from "./KeyValue";
import "./detail.css";

/** The signal-id link's colour: a `high`-level signal is drawn as urgent as a critical verdict, a
 *  `warn` as a high one, anything else (including the open-ended `"info"`) as low. Ported from
 *  legacy `signalHtml`'s inline `t` (`report.js:719`) — this mapping is signal-severity vocabulary
 *  that only this one row needs, unlike `TONE()` and `sevTone()` which several surfaces share. */
function signalTone(level: SignalLevel): Tone {
  if (level === "high") return "crit";
  if (level === "warn") return "high";
  return "low";
}

/** A signal's `data` value, written the way legacy's dump wrote it (`report.js:716`): an object or
 *  array is JSON-stringified, `null` is spelled out, a string is shown as itself, and a number or
 *  boolean (the only shapes JSON-decoded signal data ever carries besides those three) prints the
 *  same digits `String()` would — `JSON.stringify` gives that without inviting the "might stringify
 *  to `[object Object]`" lint concern a bare `String(value)` on an `unknown` would raise here. */
function formatDataValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function signalRows(data: Readonly<Record<string, unknown>>): readonly KeyValueRow[] {
  const entries = Object.entries(data);
  if (entries.length === 0) return [{ label: "—", value: "no data" }];

  return entries.map(([key, value]) => ({ label: key, value: formatDataValue(value) }));
}

/** One expandable signal — ported from legacy `signalHtml` (`report.js:712-725`). Every signal id
 *  links out, not only the three `SIGNAL_DOC` names it: the fallback is the glossary's signals
 *  anchor, same as legacy's `SIGNAL_DOC[s.id] || DOCS + "#the-signals"`. The link sits beside the
 *  `<details>` rather than inside its `<summary>`: a summary is itself a control, and a link nested
 *  in it is unreachable to assistive tech and fires the disclosure on click. */
function SignalRow({ signal }: { signal: Signal }) {
  const doc = SIGNAL_DOC[signal.id] ?? `${DOCS_URL}#the-signals`;

  return (
    <div className="detail-signal">
      <a
        className={`detail-signal-id tone-${signalTone(signal.level)}`}
        href={doc}
        target="_blank"
        rel="noopener noreferrer"
        title={SIGNAL_DEFS[signal.id] ?? ""}
      >
        {signal.id}
      </a>
      <details className="detail-signal-more">
        <summary className="detail-signal-summary">
          <span className="detail-signal-summary-text">{signal.summary}</span>
        </summary>
        <div className="detail-signal-data">
          <KeyValue rows={signalRows(signal.data)} />
        </div>
      </details>
    </div>
  );
}

/**
 * "Signals — what was observed": every signal that fired for this finding, each expandable into its
 * raw data. Ported from legacy's signal list (`report.js:838-839`). A finding with no signal at all
 * still gets the section, with the same explanatory line legacy showed instead of an empty list.
 */
export function SignalList({ finding }: { finding: Finding }) {
  return (
    <section className="detail-section">
      <h3>Signals — what was observed</h3>
      {finding.signals.length === 0 ? (
        <p className="detail-signal-empty">
          No signal fired. The verdict comes from what lockrot could not learn.
        </p>
      ) : (
        finding.signals.map((signal) => <SignalRow key={signal.id} signal={signal} />)
      )}
    </section>
  );
}
