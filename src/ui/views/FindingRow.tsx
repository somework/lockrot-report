import type { TargetedMouseEvent } from "preact";
import type { Action } from "../../state/types";
import type { Finding, Signal } from "../../model/types";
import { useReport } from "../context";
import { Pill, Tag, toneClass } from "../common/common";
import { DOCS_URL, SIGNAL_DEFS, SIGNAL_DOC, TONE } from "../../domain/vocab";
import { plural } from "../../domain/format";
import { sevTone } from "../../domain/advisories";
import { severityRank } from "../../domain/severity";
import { signalSortKey } from "../../domain/filters";
import { ageScale } from "../../domain/age";
import { AgeScale } from "./AgeScale";
import "./views.css";

/**
 * The click contract FindingRow and PackagesView's rows share: a click anywhere on the row toggles
 * the detail pane, closing it again on a second click of the same package — unless the click landed
 * on a real `<a>`, a `<button>` (PD-GLOSSARY-4: the verdict pill's popover trigger and its own "In
 * the glossary" button), or inside an open popover (its content is a descendant of the row in the
 * DOM even though the top layer draws it elsewhere), each of which is left to do its own thing.
 * Keyboard activation (Enter/Space, and DESIGN.md M5's fix so a focused control's own Enter is left
 * alone) is `ui/keyboard.ts`'s job: it reads the same `data-pkg` every row here carries through one
 * document-level listener, so a row needs no `onKeyDown` of its own — adding one would just race the
 * global handler over who dispatches first.
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
      if ((event.target as HTMLElement).closest("a, button, [popover]")) return;
      dispatch({ type: "select", pkg: isOpen ? null : pkg });
    },
  };
}

/**
 * The click contract AdvisoryRow and PulledRow share instead: a click always opens `pkg`, and never
 * closes it again — legacy's own affordance for these two lists (`<button data-open>`, always
 * `select(open.dataset.open)`, `report.js:969-970`, which never clears `open`). Both lists can show
 * the same package under more than one row (several advisories, or several direct requirements
 * pulling the same transitive package in); with the toggle above, clicking a second row for an
 * already-open package would close it instead of doing nothing (quality/parity fix — this was
 * `rowInteractions` for both, unlike legacy).
 */
export function openInteractions(
  pkg: string,
  dispatch: (action: Action) => void,
): {
  onClick: (event: TargetedMouseEvent<HTMLElement>) => void;
} {
  return {
    onClick: (event) => {
      if ((event.target as HTMLElement).closest("a, button, [popover]")) return;
      dispatch({ type: "select", pkg });
    },
  };
}

/** `high` outranks `warn` outranks everything else (including the open-ended `"info"` and a signal
 *  id this renderer does not yet know a level for) — the same three-tier reading `SignalList.tsx`'s
 *  `signalTone` gives a signal's own colour, used here to rank instead of to paint. */
const LEVEL_RANK: Readonly<Record<string, number>> = { high: 2, warn: 1 };

/**
 * The one signal a Findings row leads with (PD-ROWS-1, DESIGN.md §5): the highest-level signal,
 * ties broken in `SIGNAL_IDS` numeric order (`domain/filters.ts#signalSortKey`, the same order the
 * rail's own signal group and the glossary sort by, M2's fix) — never the document's own order,
 * which is lockrot's internal rule evaluation order and carries no such guarantee. `undefined` for
 * a finding with no signal at all; the caller falls back to the evidence sentence.
 */
function keyFactSignal(signals: readonly Signal[]): Signal | undefined {
  return [...signals].sort((a, b) => {
    const rank = (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0);
    if (rank !== 0) return rank;
    const [an, as] = signalSortKey(a.id);
    const [bn, bs] = signalSortKey(b.id);
    return an !== bn ? an - bn : as.localeCompare(bs);
  })[0];
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
 *  id, the age scale is an image, not a link) and an option's children are presentational, which
 *  would hide those from assistive tech. The open row is marked with `aria-current`, the list-item
 *  equivalent of a selection. Verdict, replacement, name, version, tags, then one key-fact line and
 *  its age scale (or the evidence sentence when the finding carries no signal at all) — ported from
 *  legacy `rowHtml` (report.js:406-446), collapsed from up to three signal lines to one plus a scale
 *  per PD-ROWS-1/PD-ROWS-2 (DESIGN.md §5): a reviewer's own reading of the up-to-three lines was
 *  "text, text, text, no scales". The verdict pill carries `docs` (PD-GLOSSARY-5) so a reader gets
 *  the definition without opening the package at all; `rowInteractions`'s guard above is what keeps
 *  that click from also toggling the row. */
export function FindingRow({ finding }: { finding: Finding }) {
  const { model, state, dispatch } = useReport();
  const isOpen = state.pkg === finding.package;
  const stripeTone = TONE(finding.priority === "none" ? finding.verdict : finding.priority);
  const keyFact = keyFactSignal(finding.signals);
  const rest = keyFact ? finding.signals.length - 1 : 0;
  const scale = keyFact ? ageScale(finding, model.report.run.thresholds) : null;

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
          <Pill word={finding.verdict} docs />
          {finding.replacement && (
            <Tag title="the repository names this package as the replacement">→ {finding.replacement}</Tag>
          )}
          <span className="pkg">{finding.package}</span>
          <span className="ver mono">{finding.version}</span>
          <RowTags finding={finding} />
        </span>
        {keyFact ? (
          <span className="key-fact">
            <span className="sig-lines">
              <SignalLine signal={keyFact} />
              {rest > 0 && (
                <span className="more-sig">
                  + {plural(rest, "more signal", "more signals")}, open the package
                </span>
              )}
            </span>
            {scale && <AgeScale scale={scale} />}
          </span>
        ) : (
          <span className="ev">{finding.evidence}</span>
        )}
      </span>
    </li>
  );
}
