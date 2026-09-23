import type { TargetedMouseEvent } from "preact";
import type { Action } from "../../state/types";
import type { Finding, Signal } from "../../model/types";
import { useReport } from "../context";
import { Pill, Tag, toneClass } from "../common/common";
import { DOCS_URL, SIGNAL_DEFS, SIGNAL_DOC, TONE } from "../../domain/vocab";
import { plural } from "../../domain/format";
import { sevTone } from "../../domain/advisories";
import { severityRank } from "../../domain/severity";
import "./views.css";

/**
 * The click contract every row in this slice shares: a click anywhere on the row toggles the detail
 * pane, closing it again on a second click of the same package — unless the click landed on a real
 * `<a>`, which is left to navigate. Keyboard activation (Enter/Space, and DESIGN.md M5's fix so a
 * focused link's own Enter is left alone) is `ui/keyboard.ts`'s job: it reads the same `data-pkg`
 * every row here carries through one document-level listener, so a row needs no `onKeyDown` of its
 * own — adding one would just race the global handler over who dispatches first.
 */
export function rowInteractions(
  pkg: string,
  isOpen: boolean,
  dispatch: (action: Action) => void,
): {
  onClick: (event: TargetedMouseEvent<HTMLElement>) => void;
} {
  return {
    onClick: (event) => {
      if ((event.target as HTMLElement).closest("a")) return;
      dispatch({ type: "select", pkg: isOpen ? null : pkg });
    },
  };
}

/** One S1-S10 line inside a row (legacy `signalLine`, report.js:397-404). */
function SignalLine({ signal }: { signal: Signal }) {
  const levelClass = signal.level === "high" ? " is-high" : signal.level === "warn" ? " is-warn" : "";
  const doc = SIGNAL_DOC[signal.id] ?? `${DOCS_URL}#the-signals`;
  return (
    <span className={`sig-line${levelClass}`}>
      <a
        className="sid"
        href={doc}
        target="_blank"
        rel="noopener noreferrer"
        title={SIGNAL_DEFS[signal.id] ?? ""}
      >
        {signal.id}
      </a>
      <span>{signal.summary}</span>
    </span>
  );
}

/** The tags on a Findings row, in legacy's fixed `unshift`/`push` order (js-2.md §"tag order"):
 *  baseline state first (if new/worsened), then the advisory count, then direct/transitive, then
 *  require-dev last. */
function RowTags({ finding }: { finding: Finding }) {
  const bstate = finding.baseline?.status;
  const worst =
    finding.advisories.length > 0
      ? [...finding.advisories].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0]
      : undefined;

  return (
    <span className="tags">
      {(bstate === "new" || bstate === "worsened") && (
        <Tag
          tone={bstate === "new" ? "crit" : "high"}
          title={bstate === "new" ? "not in the baseline file" : "the baseline recorded a milder verdict"}
        >
          {bstate}
        </Tag>
      )}
      {worst && (
        <Tag tone={sevTone(worst.severity)}>
          {plural(finding.advisories.length, "advisory", "advisories")}
        </Tag>
      )}
      <Tag
        title={
          finding.direct
            ? "required by this project's composer.json"
            : "installed because something else requires it"
        }
      >
        {finding.direct ? "direct" : "transitive"}
      </Tag>
      {finding.dev && <Tag title="installed only for development">require-dev</Tag>}
    </span>
  );
}

/** A Findings-tab row: a list item rather than a listbox option, because it holds links (the signal
 *  ids) and an option's children are presentational, which would hide those links from assistive
 *  tech. The open row is marked with `aria-current`, the list-item equivalent of a selection.
 *  Verdict, replacement, name, version, tags, then up to three signal lines (or
 *  the evidence sentence when the finding carries none) — ported from legacy `rowHtml`
 *  (report.js:406-446). */
export function FindingRow({ finding }: { finding: Finding }) {
  const { state, dispatch } = useReport();
  const isOpen = state.pkg === finding.package;
  const stripeTone = TONE(finding.priority === "none" ? finding.verdict : finding.priority);
  const shown = finding.signals.slice(0, 3);
  const rest = finding.signals.length - shown.length;

  return (
    <li
      tabIndex={0}
      aria-current={isOpen ? "true" : undefined}
      aria-label={finding.package}
      data-pkg={finding.package}
      className={`row ${toneClass(stripeTone)}`}
      {...rowInteractions(finding.package, isOpen, dispatch)}
    >
      <span className="stripe" />
      <span className="body">
        <span className="line1">
          <Pill word={finding.verdict} />
          {finding.replacement && (
            <Tag title="the repository names this package as the replacement">→ {finding.replacement}</Tag>
          )}
          <span className="pkg">{finding.package}</span>
          <span className="ver mono">{finding.version}</span>
          <RowTags finding={finding} />
        </span>
        {shown.length > 0 ? (
          <span className="sig-lines">
            {shown.map((signal) => (
              <SignalLine key={signal.id} signal={signal} />
            ))}
            {rest > 0 && (
              <span className="more-sig">
                + {plural(rest, "more signal", "more signals")}, open the package
              </span>
            )}
          </span>
        ) : (
          <span className="ev">{finding.evidence}</span>
        )}
      </span>
    </li>
  );
}
