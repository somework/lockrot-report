import type { TargetedMouseEvent } from "preact";
import type { Action } from "../../state/types";
import type { Finding, Signal } from "../../model/types";
import { useReport } from "../context";
import { Tag, toneClass } from "../common/common";
import { DOCS_URL, SIGNAL_DEFS, SIGNAL_DOC, TONE, VERDICT_DEFS } from "../../domain/vocab";
import { plural } from "../../domain/format";
import { sevTone } from "../../domain/advisories";
import { severityRank } from "../../domain/severity";
import { ageNotRead, ageScale, type AgeAxis } from "../../domain/age";
import { reachText, rowSignals, shortFact, vendorOf } from "../../domain/rows";
import { AgeCell, AgeCellEmpty } from "./AgeScale";
import "./views.css";
import "./ledger-rows.css";

/**
 * The click contract every list row shares — Findings, Packages, Advisories and Blast radius: a
 * click anywhere on the row opens `pkg`, and a click on the package that is already open leaves it
 * open (PD-ROWS-7, DESIGN.md §5: the row used to toggle, so a second click on the open row — the
 * most natural "yes, that one" — closed the very detail the reader was reading; Close and Escape
 * are the ways out). A click that landed on a real `<a>` (a signal id's own link), a `<button>`, or
 * inside an open popover (its content is a descendant of the row in the DOM even though the top
 * layer draws it elsewhere) is left to do its own thing. The row's own verdict word is plain text,
 * not one of those (PD-GLOSSARY-4/5), so a click on it falls through to the row like any other word
 * in it. Keyboard activation (Enter/Space, and DESIGN.md M5's fix so a focused control's own Enter
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
      if ((event.target as HTMLElement).closest("a, button, [popover]")) return;
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

/** A signal id, linked to its own entry in lockrot's docs, with the signal's definition on hover. */
function SignalId({ signal }: { signal: Signal }) {
  const doc = SIGNAL_DOC[signal.id] ?? `${DOCS_URL}#the-signals`;
  return (
    <a
      className="sid"
      href={doc}
      target="_blank"
      rel="noopener noreferrer"
      title={SIGNAL_DEFS[signal.id] ?? ""}
    >
      {signal.id}
    </a>
  );
}

/** One of the other signals, as print shows it under the quoted one (legacy `signalLine`). */
function SignalLine({ signal }: { signal: Signal }) {
  return (
    <span className="sig-line">
      <SignalId signal={signal} />
      <span>{signal.summary}</span>
    </span>
  );
}

/** The baseline state first (if new/worsened), as legacy ordered the row's tags. */
function BaselineTag({ finding }: { finding: Finding }) {
  const status = finding.baseline?.status;
  if (status !== "new" && status !== "worsened") return null;
  return (
    <Tag
      tone={status === "new" ? "crit" : "high"}
      title={status === "new" ? "not in the baseline file" : "the baseline recorded a milder verdict"}
    >
      {status}
    </Tag>
  );
}

/** "2 advisories", in the tone of the worst severity among them, ahead of the row's reason. */
function AdvisoryTag({ finding }: { finding: Finding }) {
  if (finding.advisories.length === 0) return null;
  const worst = [...finding.advisories].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  )[0];
  if (!worst) return null;
  return (
    <Tag tone={sevTone(worst.severity)}>{plural(finding.advisories.length, "advisory", "advisories")}</Tag>
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
 * is marked with `aria-current`; its accessible name is the package alone.
 *
 * The verdict word is plain text with its definition as a `title` (PD-GLOSSARY-4/5): a click on it
 * opens the package, like a click anywhere else in the row. The quoted signal's id links to its
 * docs; the others stay mounted under a native `hidden` attribute, so they read as inaccessible on
 * screen while `print.css` un-hides that exact selector — paper has no package to open (PD-ROWS-1).
 */
export function FindingRow({ finding, axis, quoted, ditto }: FindingRowProps) {
  const { model, state, dispatch } = useReport();
  const isOpen = state.pkg === finding.package;
  const { key, rest } = rowSignals(finding, quoted);
  const scale = axis ? ageScale(finding, model.report.run.thresholds, axis.max) : null;
  const vendor = vendorOf(finding.package);
  const name = vendor === null ? finding.package : finding.package.slice(vendor.length + 1);
  const dim = (on: boolean) => (on ? " is-ditto" : "");

  return (
    <li
      tabIndex={0}
      aria-current={isOpen ? "true" : undefined}
      aria-label={finding.package}
      data-pkg={finding.package}
      className={`frow ${toneClass(TONE(finding.verdict))}`}
      {...openInteractions(finding.package, dispatch)}
    >
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
        <AdvisoryTag finding={finding} />
        {key && <SignalId signal={key} />}
        <span className="fc-why-text">{key ? shortFact(key, finding) : finding.evidence}</span>
        {rest.length > 0 && (
          <span className="sig-rest" hidden>
            {rest.map((signal) => (
              <SignalLine key={signal.id} signal={signal} />
            ))}
          </span>
        )}
      </span>
      {scale ? (
        <AgeCell scale={scale} verdict={finding.verdict} />
      ) : (
        <AgeCellEmpty axis={axis} notRead={ageNotRead(finding)} />
      )}
    </li>
  );
}
