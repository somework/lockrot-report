import type { TargetedMouseEvent } from "preact";
import type { Action } from "../../state/types";
import type { Finding, Signal } from "../../model/types";
import { useReport } from "../context";
import { toneClass } from "../common/common";
import { AdvisoryChip } from "../common/AdvisoryChip";
import { signalDef, signalDocUrl, TONE, VERDICT_DEFS } from "../../domain/vocab";
import { ageNotRead, ageScale, type AgeAxis } from "../../domain/age";
import { pinnedKindOf } from "../../domain/pinned";
import { reachText, rowSignals, shortFact, vendorOf } from "../../domain/rows";
import { innerTabIndex, rowTabIndex } from "../rowCursor";
import { AgeCell, AgeCellEmpty } from "./AgeScale";
import { MatchNote, useSearchHit } from "../search/MatchNote";
import { usePrinted } from "../print/printContext";
import "./views.css";
import "./ledger-rows.css";
import "./baseline.css";

/**
 * Every list row: a click opens `pkg` and never closes the open one (PD-ROWS-7). A click on a real
 * link, button, open popover, `data-no-open` part or nested row is left alone. Keyboard activation
 * lives in `ui/keyboard.ts`, which reads `data-pkg` through one listener; a row `onKeyDown` would
 * race it.
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

/** Drawn quieter, never removed: a search hit and a screen reader still read them. */
export interface Ditto {
  readonly verdict: boolean;
  readonly vendor: boolean;
  readonly why: boolean;
  readonly reach: boolean;
}

export const NO_DITTO: Ditto = { verdict: false, vendor: false, why: false, reach: false };

/** An id that is not lockrot's (`acme:licence`) has no docs entry, so no link. */
function SignalId({ signal, tabIndex }: { signal: Signal; tabIndex: -1 | undefined }) {
  const doc = signalDocUrl(signal.id);
  const title = signalDef(signal.id);
  if (doc === null) {
    return (
      <span className="sid" title={title}>
        {signal.id}
      </span>
    );
  }
  return (
    <a className="sid" href={doc} tabIndex={tabIndex} target="_blank" rel="noopener noreferrer" title={title}>
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

/**
 * Both wear the baseline's accent (PD-BASELINE-7), not the row's own verdict and priority tones.
 */
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

/** Wraps after the vendor's slash, not at whichever hyphen fits. */
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
  readonly axis: AgeAxis | null;
  /** The signal the rail filters by, when it filters by exactly one (PD-ROWS-5). */
  readonly quoted: string | null;
  readonly ditto: Ditto;
}

/**
 * A Findings row (PD-ROWS-4). No value is cut to an ellipsis. A list item, not an option, because
 * it holds a link. The other signals stay mounted under `hidden`, which print.css un-hides
 * (PD-ROWS-1).
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
        <AgeCell
          scale={scale}
          verdict={finding.verdict}
          pinned={pinnedKindOf(finding, model.details.get(finding.package) ?? null)}
        />
      ) : (
        <AgeCellEmpty axis={axis} notRead={ageNotRead(finding)} />
      )}
    </>
  );

  // On paper each row is a table row, so a page breaks between rows and the group head repeats.
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
