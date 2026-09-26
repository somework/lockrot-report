import type { TargetedMouseEvent } from "preact";
import type { Action } from "../../state/types";
import type { Finding, Signal } from "../../model/types";
import { useReport } from "../context";
import { toneClass } from "../common/common";
import { AdvisoryChip } from "../common/AdvisoryChip";
import { DOCS_URL, SIGNAL_DEFS, SIGNAL_DOC, TONE, VERDICT_DEFS } from "../../domain/vocab";
import { ageNotRead, ageScale, type AgeAxis } from "../../domain/age";
import { reachText, rowSignals, shortFact, vendorOf } from "../../domain/rows";
import { innerTabIndex, rowTabIndex } from "../rowCursor";
import { AgeCell, AgeCellEmpty } from "./AgeScale";
import { MatchNote, useSearchHit } from "../search/MatchNote";
import { usePrinted } from "../print/printContext";
import "./views.css";
import "./ledger-rows.css";
import "./baseline.css";

/**
 * The click contract every list row shares — Findings, Packages, Advisories and Blast radius: a
 * click anywhere on the row opens `pkg`, and a click on the package that is already open leaves it
 * open (PD-ROWS-7, DESIGN.md §5: the row used to toggle, so a second click on the open row — the
 * most natural "yes, that one" — closed the very detail the reader was reading; Close and Escape
 * are the ways out). A click that landed on a real `<a>` (a signal id's own link), a `<button>`, or
 * inside an open popover (its content is a descendant of the row in the DOM even though the top
 * layer draws it elsewhere) is left to do its own thing, and so is a part marked `data-no-open` (a
 * Blast radius row's squares, which open its list) and a row nested inside this one. The row's own
 * verdict word is plain text, not one of those (PD-GLOSSARY-4/5), so a click on it falls through to
 * the row like any other word in it. Keyboard activation (Enter/Space, and DESIGN.md M5's fix so a focused control's own Enter
 * is left alone) is `ui/keyboard.ts`'s job, with the same open-never-close rule: it reads the same
 * `data-pkg` every row carries through one document-level listener, so a row needs no `onKeyDown`
 * of its own — adding one would just race the global handler over who dispatches first.
 */
export function openInteractions(
  pkg: string,
  dispatch: (action: Action) => void,
): {
  onClick: (event: TargetedMouseEvent<HTMLElement>) => void;
} {
  return {
    onClick: (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("a, button, [popover], [data-no-open]")) return;
      // A row nested in this one (a Blast radius row's own packages) opens its own package.
      const row = target.closest("[data-pkg]");
      if (row !== null && row !== event.currentTarget) return;
      dispatch({ type: "select", pkg });
    },
  };
}

/** Which of a row's values repeat the row above it in the same stretch of the list (PD-ROWS-5):
 *  those are drawn quieter, never removed — they are still what a search hit or a screen reader
 *  reads. The verdict keeps its tone when it repeats; only its weight drops. */
export interface Ditto {
  readonly verdict: boolean;
  readonly vendor: boolean;
  readonly why: boolean;
  readonly reach: boolean;
}

export const NO_DITTO: Ditto = { verdict: false, vendor: false, why: false, reach: false };

/** A signal id, linked to its own entry in lockrot's docs, with the signal's definition on hover.
 *  `tabIndex` is -1 on every row but the list's Tab stop (PD-ROWS-11, `rowCursor.ts`). */
function SignalId({ signal, tabIndex }: { signal: Signal; tabIndex: -1 | undefined }) {
  const doc = SIGNAL_DOC[signal.id] ?? `${DOCS_URL}#the-signals`;
  return (
    <a
      className="sid"
      href={doc}
      tabIndex={tabIndex}
      target="_blank"
      rel="noopener noreferrer"
      title={SIGNAL_DEFS[signal.id] ?? ""}
    >
      {signal.id}
    </a>
  );
}

/** One of the other signals, as print shows it under the quoted one (legacy `signalLine`). */
function SignalLine({ signal, tabIndex }: { signal: Signal; tabIndex: -1 | undefined }) {
  return (
    <span className="sig-line">
      <SignalId signal={signal} tabIndex={tabIndex} />
      <span>{signal.summary}</span>
    </span>
  );
}

/** The baseline state first (if new/worsened), as legacy ordered the row's tags. A worsened row
 *  names the verdict the baseline accepted (PD-BASELINE-2, DESIGN.md §5), so the step it took is
 *  read on the row rather than only in its detail. Both wear the baseline's accent (PD-BASELINE-7,
 *  views/baseline.css), not the critical and high tones the row's own verdict and priority use. */
function BaselineTag({ finding }: { finding: Finding }) {
  const { model } = useReport();
  const baseline = finding.baseline;
  const status = baseline?.status;
  if (baseline === null || (status !== "new" && status !== "worsened")) return null;
  const path = model.report.baseline?.path || "the baseline file";
  if (status === "new") {
    return (
      <span className="tag bl-tag" title={`not in ${path}`}>
        new
      </span>
    );
  }
  const previous = baseline.previousVerdict;
  return (
    <span
      className="tag bl-tag"
      title={
        previous === null
          ? `${path} recorded a milder verdict`
          : `${path} accepted it as ${previous}; it is ${finding.verdict} now`
      }
    >
      {previous === null ? "worsened" : `worsened from ${previous}`}
    </span>
  );
}

/** A package name that wraps after its vendor's slash — "sensio/" over "framework-extra-bundle" —
 *  rather than at the last hyphen that happens to fit (`.fc-unit`, ledger-rows.css). */
function Breakable({ name }: { name: string }) {
  const slash = name.indexOf("/");
  if (slash < 0) return <span className="fc-unit">{name}</span>;
  return (
    <>
      {name.slice(0, slash + 1)}
      <wbr />
      <span className="fc-unit">{name.slice(slash + 1)}</span>
    </>
  );
}

function Reach({ finding }: { finding: Finding }) {
  const root = finding.chain[0];
  return (
    <>
      {finding.direct || !root ? (
        reachText(finding)
      ) : (
        <>
          <span className="fc-via">via</span> <Breakable name={root} />
        </>
      )}
      {finding.dev && (
        <span className="fc-dev" title="installed only for development">
          dev
        </span>
      )}
    </>
  );
}

export interface FindingRowProps {
  readonly finding: Finding;
  /** The list's one shared age axis (`domain/age.ts#ageAxis`), or null when the run recorded no
   *  thresholds to draw one against. */
  readonly axis: AgeAxis | null;
  /** The signal the rail filters by, when it filters by exactly one (PD-ROWS-5). */
  readonly quoted: string | null;
  readonly ditto: Ditto;
}

/**
 * A Findings-tab row, one line of a ledger (PD-ROWS-4, DESIGN.md §5): verdict · package · why it is
 * flagged · years since release on the list's shared axis · how it gets in. Wide, a single line
 * under the column head; beside an open package, two lines — the package and how it gets in, then
 * the verdict and the reason, the age beside both; on a phone, three. No value is ever cut to an
 * ellipsis: a cell too narrow for its words wraps them instead (`ledger-rows.css`). The package and
 * its way in share one wrapper (`.fc-line`): a flex line in the two-line layout, dissolved into the
 * row's own grid in the others. A list item rather than a listbox option,
 * because it holds a link (the signal id) and an option's children are presentational. The open row
 * is marked with `aria-current`; its accessible name is the package alone. One row of the list is
 * its Tab stop (PD-ROWS-11, `rowCursor.ts`); the others, and their signal links, are `tabindex=-1`.
 *
 * The verdict word is plain text with its definition as a `title` (PD-GLOSSARY-4/5): a click on it
 * opens the package, like a click anywhere else in the row. The quoted signal's id links to its
 * docs; the others stay mounted under a native `hidden` attribute, so they read as inaccessible on
 * screen while `print.css` un-hides that exact selector — paper has no package to open (PD-ROWS-1).
 * A row the search box found only in its evidence quotes the words around the hit under its reason
 * (PD-SEARCH-1), unless the reason already shows them.
 */
export function FindingRow({ finding, axis, quoted, ditto }: FindingRowProps) {
  const { model, state, dispatch, cursor } = useReport();
  const isOpen = state.pkg === finding.package;
  const inner = innerTabIndex(finding.package, cursor);
  const { key, rest } = rowSignals(finding, quoted);
  const scale = axis ? ageScale(finding, model.report.run.thresholds, axis.max) : null;
  const vendor = vendorOf(finding.package);
  const name = vendor === null ? finding.package : finding.package.slice(vendor.length + 1);
  const dim = (on: boolean) => (on ? " is-ditto" : "");
  const why = key ? shortFact(key, finding) : finding.evidence;
  const hit = useSearchHit(finding);
  const printed = usePrinted();
  const rowClass = `frow ${toneClass(TONE(finding.verdict))}`;

  const cells = (
    <>
      <span className={`fcell fc-verdict${dim(ditto.verdict)}`} title={VERDICT_DEFS[finding.verdict] ?? ""}>
        {finding.verdict}
      </span>
      <span className="fc-line">
        <span className="fcell fc-pkg" title={`${finding.package} ${finding.version}`}>
          {vendor !== null && (
            <>
              <span className={`fc-vendor${dim(ditto.vendor)}`}>{vendor}/</span>
              <wbr />
            </>
          )}
          <span className="fc-name fc-unit">{name}</span> <span className="fc-ver">{finding.version}</span>
          <BaselineTag finding={finding} />
        </span>
        <span
          className={`fcell fc-reach${dim(ditto.reach)}`}
          title={
            finding.direct
              ? "required by this project's composer.json"
              : finding.chain.join(" › ") || undefined
          }
        >
          <Reach finding={finding} />
        </span>
      </span>
      <span className={`fcell fc-why${dim(ditto.why)}`} title={key?.summary ?? finding.evidence}>
        <AdvisoryChip finding={finding} />
        {key && <SignalId signal={key} tabIndex={inner} />}
        <span className="fc-why-text">{why}</span>
        <MatchNote hit={hit} shown={why} />
        {rest.length > 0 && (
          <span className="sig-rest" hidden>
            {rest.map((signal) => (
              <SignalLine key={signal.id} signal={signal} tabIndex={inner} />
            ))}
          </span>
        )}
      </span>
      {scale ? (
        <AgeCell scale={scale} verdict={finding.verdict} />
      ) : (
        <AgeCellEmpty axis={axis} notRead={ageNotRead(finding)} />
      )}
    </>
  );

  // On paper (PD-PRINT-4) the row is a table row around the same grid, so the group's head repeats
  // on every page it runs onto and a page breaks between rows; nothing on paper opens or focuses.
  if (printed) {
    return (
      <li className="pf-tr" aria-label={finding.package} data-pkg={finding.package}>
        <div className="pf-td">
          <div className={rowClass}>{cells}</div>
        </div>
      </li>
    );
  }

  return (
    <li
      tabIndex={rowTabIndex(finding.package, cursor)}
      aria-current={isOpen ? "true" : undefined}
      aria-label={finding.package}
      data-pkg={finding.package}
      className={rowClass}
      {...openInteractions(finding.package, dispatch)}
    >
      {cells}
    </li>
  );
}
