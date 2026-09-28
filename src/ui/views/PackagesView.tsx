import type { Finding } from "../../model/types";
import { SIGNAL_IDS } from "../../model/types";
import type { SortKey } from "../../state/types";
import { Fragment } from "preact";
import { useRef } from "preact/hooks";
import { useReport } from "../context";
import { useOverflowX } from "../useOverflowX";
import { applyFilters, population } from "../../domain/filters";
import { packagistUrl } from "../../domain/links";
import { day, fixed } from "../../domain/format";
import {
  libyearsAtZero,
  libyearsAtZeroMark,
  libyearsAxisMax,
  libyearsReason,
  libyearsTally,
  type LibyearsTally,
} from "../../domain/libyears";
import { checkName, checkStrip, levelTone } from "../../domain/checks";
import { sharedDataDay } from "../../domain/share";
import { isKnownSignalId, TONE } from "../../domain/vocab";
import { Pill, Muted, toneClass } from "../common/common";
import { AdvisoryChip } from "../common/AdvisoryChip";
import { innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "./FindingRow";
import { EmptyState } from "./EmptyState";
import { MatchNote, useSearchHit } from "../search/MatchNote";
import { usePrinted } from "../print/printContext";
import "./views.css";
import "./packages.css";

/** Labels match the accessible names `e2e/support/new.ts` expects; `cell` places each cell in the
 *  phone grid. */
const COLUMNS: readonly { key: SortKey; label: string; cell: string; title?: string }[] = [
  { key: "package", label: "Package", cell: "pk-name" },
  { key: "version", label: "Version", cell: "pk-ver" },
  {
    key: "libyears",
    label: "Libyears",
    cell: "pk-ly",
    title:
      "Years between the installed release and the package's newest dated release, on one scale down the list; a dash is a package not behind its newest release, a question mark one that could not be measured — each says why on hover",
  },
  { key: "verdict", label: "Verdict", cell: "pk-verdict" },
  { key: "priority", label: "Priority", cell: "pk-prio" },
  { key: "reached", label: "Reached", cell: "pk-reach" },
  {
    key: "signals",
    label: "Signals",
    cell: "pk-sig",
    title: "S1 to S10, one dot each, filled in its level's tone where the signal fired",
  },
  { key: "data", label: "Data as of", cell: "pk-data" },
];

/** 0-100, clamped: a value past the scale's edge is drawn at the edge. */
function pct(value: number, max: number): string {
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

/** At zero a muted dash, since zero is a clamped difference, not an age; each dash keeps its reason
 *  as hover text and screen-reader words. On paper the value and a short mark. */
function LibyearsCell({ finding, max }: { finding: Finding; max: number | null }) {
  const { model } = useReport();
  const printed = usePrinted();
  const value = fixed(finding.libyears, 1);
  const metadata = model.details.get(finding.package)?.metadata ?? null;
  if (value === null) {
    const reason = libyearsReason(finding);
    const why = reason === "" ? "not measured" : `not measured: ${reason}`;
    return (
      <span className="ly-mark" title={why}>
        <span aria-hidden="true">{printed ? "—" : "?"}</span>
        <span className="vh">{why}</span>
      </span>
    );
  }
  if (printed) {
    const mark = libyearsAtZeroMark(finding, metadata);
    return (
      <>
        {value}
        {mark !== null && <Muted> · {mark}</Muted>}
      </>
    );
  }
  const zero = libyearsAtZero(finding, metadata);
  if (zero !== null) {
    return (
      <span className="ly-mark" title={`${value}: ${zero}`}>
        <span aria-hidden="true">—</span>
        <span className="vh">
          {value}, {zero}
        </span>
      </span>
    );
  }
  return (
    <span className="ly-cell">
      {max !== null && (
        <span className="ly-track" aria-hidden="true">
          <span className="ly-bar" style={{ width: pct(finding.libyears ?? 0, max) }} />
        </span>
      )}
      <span className="ly-num">{value}</span>
    </span>
  );
}

/** The Signals cell on paper: the fired ids in document order, one this page does not know in code. */
function PrintedIds({ ids }: { ids: readonly string[] }) {
  if (ids.length === 0) return <>—</>;
  return (
    <>
      {ids.map((id, index) => (
        <Fragment key={`${index}-${id}`}>
          {index > 0 && " "}
          {isKnownSignalId(id) ? id : <code>{id}</code>}
        </Fragment>
      ))}
    </>
  );
}

/** Ten dots that read down the list as a matrix; decoration only, the fired ids are the cell's
 *  words. */
function SignalsCell({ finding }: { finding: Finding }) {
  const printed = usePrinted();
  const ids = finding.signals.map((signal) => signal.id);
  if (printed) return <PrintedIds ids={ids} />;
  const strip = checkStrip(finding);
  const fired = strip.cells.filter((cell) => cell.state === "fired");
  const title =
    fired.length === 0 ? "no signal fired" : fired.map((cell) => `${cell.id} ${checkName(cell)}`).join(" · ");
  return (
    <span className="sig-dots" title={title}>
      <span className="sig-dots-row" aria-hidden="true">
        {strip.cells.map((cell) => (
          <i
            key={cell.id}
            className={
              cell.signal === null
                ? `sig-dot is-${cell.state}`
                : `sig-dot is-fired ${toneClass(levelTone(cell.signal.level))}`
            }
          />
        ))}
      </span>
      <span className="vh">{ids.length === 0 ? "none" : ids.join(" ")}</span>
      {strip.unknown.length > 0 && (
        <span className="sig-dots-more">
          {" +"}
          {strip.unknown.map((id, index) => (
            <Fragment key={id}>
              {index > 0 && " "}
              <code>{id}</code>
            </Fragment>
          ))}
        </span>
      )}
    </span>
  );
}

/** The name moves to its own line whole rather than breaking at a hyphen. */
function PackageName({ name }: { name: string }) {
  const slash = name.indexOf("/");
  if (slash < 0) return <span className="pk-unit">{name}</span>;
  return (
    <>
      {name.slice(0, slash + 1)}
      <wbr />
      <span className="pk-unit">{name.slice(slash + 1)}</span>
    </>
  );
}

function PackageCell({ finding }: { finding: Finding }) {
  const { model, cursor } = useReport();
  const url = packagistUrl(finding, model.details);
  if (url === null) return <PackageName name={finding.package} />;

  return (
    <a
      className="lnk"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={innerTabIndex(finding.package, cursor)}
    >
      <PackageName name={finding.package} />
    </a>
  );
}

function PackageRow({ finding, dated, max }: { finding: Finding; dated: boolean; max: number | null }) {
  const { state, dispatch, cursor } = useReport();
  const isOpen = state.pkg === finding.package;
  const hit = useSearchHit(finding);
  // On a phone the priority is the row's left rule; in forced colours `prio-<word>` gives its
  // weight.
  const rowClass =
    finding.priority === "none"
      ? "pk-row"
      : `pk-row has-prio prio-${finding.priority} ${toneClass(TONE(finding.priority))}`;

  return (
    <tr
      role="row"
      className={rowClass}
      tabIndex={rowTabIndex(finding.package, cursor)}
      aria-current={isOpen ? "true" : undefined}
      aria-label={finding.package}
      data-pkg={finding.package}
      {...openInteractions(finding.package, dispatch)}
    >
      <td role="cell" className="pk-name">
        <PackageCell finding={finding} />
        {finding.advisories.length > 0 && (
          <>
            {" "}
            <AdvisoryChip finding={finding} />
          </>
        )}
        <MatchNote hit={hit} />
      </td>
      <td role="cell" className="num pk-ver">
        {finding.version}
      </td>
      <td role="cell" className="num pk-ly">
        <LibyearsCell finding={finding} max={max} />
      </td>
      <td role="cell" className="pk-verdict">
        <Pill word={finding.verdict} />
      </td>
      <td role="cell" className="pk-prio">
        {finding.priority === "none" ? <Muted>—</Muted> : <Pill word={finding.priority} />}
      </td>
      <td role="cell" className="pk-reach">
        {finding.direct ? "direct" : "transitive"}
        {finding.dev ? " · dev" : ""}
      </td>
      <td role="cell" className="num pk-sig">
        <SignalsCell finding={finding} />
      </td>
      {dated && (
        <td role="cell" className="num pk-data">
          {day(finding.dataDate)}
        </td>
      )}
    </tr>
  );
}

/** "1 package" / "12 packages" as a bold count and its noun. */
function Count({ n, one = "package", many = "packages" }: { n: number; one?: string; many?: string }) {
  return (
    <>
      <b>{n}</b> {n === 1 ? one : many}
    </>
  );
}

/** Counts of the libyears cells below, and the marks' meaning said once. Some key items are for the
 *  stacked rows only, whose head has no room for the axis captions (PD-PACKAGES-3/5). */
function PackagesLede({ tally, listed, max }: { tally: LibyearsTally; listed: number; max: number | null }) {
  const { behind, current, unmeasured } = tally;
  return (
    <div className="pk-lede">
      <p className="pk-answer">
        <Count n={behind} /> of the <b>{listed}</b> listed {behind === 1 ? "is" : "are"} behind{" "}
        {behind === 1 ? "its" : "their"} newest release
        {current > 0 && (
          <>
            {unmeasured > 0 ? "; " : " and "}
            <b>{current}</b> {current === 1 ? "is" : "are"} not
          </>
        )}
        {unmeasured > 0 && (
          <>
            {current > 0 || behind > 0 ? ", and " : "; "}
            <b>{unmeasured}</b> could not be measured
          </>
        )}
        .
      </p>
      <p className="pk-key">
        {max !== null && behind > 0 && (
          <span className="pk-key-item pk-key-stacked">
            <span className="pk-key-bar" aria-hidden="true">
              <span />
            </span>{" "}
            a full bar is {max} libyears
          </span>
        )}
        {current > 0 && (
          <span className="pk-key-item">
            <span className="pk-key-mark" aria-hidden="true">
              —
            </span>{" "}
            not behind its newest release
            {unmeasured === 0 && <HoverHint both={false} />}
          </span>
        )}
        {unmeasured > 0 && (
          <span className="pk-key-item">
            <span className="pk-key-mark" aria-hidden="true">
              ?
            </span>{" "}
            not measured
            <HoverHint both={current > 0} />
          </span>
        )}
        <span className="pk-key-item pk-key-tablet" aria-hidden="true">
          <span className="pk-key-dot" /> a signal that fired, S1 to S10 left to right
        </span>
        <span className="pk-key-item pk-key-phone" aria-hidden="true">
          <span className="pk-key-rule" /> left rule: priority
        </span>
      </p>
    </div>
  );
}

/** On the last mark's line, so it never wraps away from the marks it means. */
function HoverHint({ both }: { both: boolean }) {
  return <span className="pk-key-hover"> · hover {both ? "either" : "it"} for why</span>;
}

/** A caption, hidden from a screen reader; the head's title says it. */
function LibyearsAxis({ max }: { max: number }) {
  return (
    <span className="ly-axis" aria-hidden="true">
      <span>0</span>
      <span>{max}y</span>
    </span>
  );
}

/** The Signals head's caption: 1 to 10 over the dots below (PD-PACKAGES-2). */
function SignalsAxis() {
  return (
    <span className="sig-dots-row sig-axis" aria-hidden="true">
      {SIGNAL_IDS.map((id) => (
        <i key={id}>{id.slice(1)}</i>
      ))}
    </span>
  );
}

/** The wrap scrolls only for names longer than any fixture's; while it does, it is a named,
 *  focusable region, so a keyboard can scroll it (WCAG 2.1.1). */
function PackagesTable({
  visible,
  dated,
  max,
}: {
  visible: readonly Finding[];
  dated: boolean;
  max: number | null;
}) {
  const { state, dispatch } = useReport();
  const printed = usePrinted();
  const wrap = useRef<HTMLDivElement>(null);
  const scrolls = useOverflowX(wrap);
  const activeSort: SortKey = state.sort;
  const columns = dated ? COLUMNS : COLUMNS.filter((column) => column.key !== "data");

  return (
    <div
      ref={wrap}
      className="tablewrap"
      {...(scrolls
        ? { tabIndex: 0, role: "region", "aria-label": "All packages table, scrolls sideways" }
        : {})}
    >
      <table className="pk-table" role="table" aria-label="All packages">
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => {
              const active = column.key === activeSort;
              const sort = active ? (state.sortDesc ? "descending" : "ascending") : "none";
              const arrow = active ? (state.sortDesc ? " ↓" : " ↑") : "";
              // Chromium prints a repeated head's button blank, so paper gets the words.
              if (printed) {
                return (
                  <th key={column.key} role="columnheader" aria-sort={sort}>
                    {column.label}
                    {arrow}
                  </th>
                );
              }
              return (
                <th
                  key={column.key}
                  role="columnheader"
                  className={column.cell}
                  aria-sort={sort}
                  title={column.title}
                >
                  <button
                    type="button"
                    className={`sort-btn${active ? " active" : ""}`}
                    onClick={() => {
                      dispatch({ type: "sort", key: column.key });
                    }}
                  >
                    {column.label}
                    {/* The header's `aria-sort` says the order; the arrow is for the eye. */}
                    <span aria-hidden="true">{arrow}</span>
                  </button>
                  {column.key === "libyears" && max !== null && <LibyearsAxis max={max} />}
                  {column.key === "signals" && <SignalsAxis />}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {visible.map((finding) => (
            <PackageRow key={finding.package} finding={finding} dated={dated} max={max} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Rows mark the open package with `aria-current`, as every tab's do. Under 1000px the same table
 *  stacks, so rows, order and keys stay the same at every width. */
export function PackagesView() {
  const { model, state } = useReport();
  const printed = usePrinted();
  const visible = applyFilters(model, state, "packages");
  // On paper a column of one repeated date is dropped; the printed section's lede gives it once.
  const dated = !printed || sharedDataDay(visible) === null;
  const max = printed ? null : libyearsAxisMax(population(model, "packages"));

  if (visible.length === 0) {
    return <EmptyState reason={population(model, "packages").length === 0 ? "clean" : "filtered"} />;
  }

  return (
    <div className="pk">
      {!printed && <PackagesLede tally={libyearsTally(visible)} listed={visible.length} max={max} />}
      <PackagesTable visible={visible} dated={dated} max={max} />
    </div>
  );
}
