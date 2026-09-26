import type { Finding } from "../../model/types";
import { SIGNAL_IDS } from "../../model/types";
import type { SortKey } from "../../state/types";
import { useReport } from "../context";
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
import { TONE } from "../../domain/vocab";
import { Pill, Muted, toneClass } from "../common/common";
import { AdvisoryChip } from "../common/AdvisoryChip";
import { innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "./FindingRow";
import { EmptyState } from "./EmptyState";
import { MatchNote, useSearchHit } from "../search/MatchNote";
import { usePrinted } from "../print/printContext";
import "./views.css";
import "./packages.css";

/** Column headers in display order, matching the accessible names `e2e/support/new.ts` expects
 *  (`SORT_LABEL`) and legacy's own column titles (report.js:581-584). `cell` names the column's
 *  cells for the phone layout's grid (packages.css), which places each by it. */
const COLUMNS: readonly { key: SortKey; label: string; cell: string; title?: string }[] = [
  { key: "package", label: "Package", cell: "pk-name" },
  { key: "version", label: "Version", cell: "pk-ver" },
  {
    key: "libyears",
    label: "Libyears",
    cell: "pk-ly",
    title:
      "Years between the installed release and the package's newest stable release, on one scale down the list; a dash is a package not behind its newest stable, a question mark one that could not be measured — each says why on hover",
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

/**
 * A package's libyears on the list's one scale (PD-PACKAGES-1, DESIGN.md §5). Above zero: a bar
 * from 0 to the value, with the value beside it. At zero — a clamped difference of release dates,
 * not an age (`domain/libyears.ts#libyearsAtZero`) — a muted dash: 184 rows of wallabag's lock used
 * to repeat "0.0 · the installed release is the newest" word for word, which the list's key now says
 * once; each dash keeps its own reason as its hover text and, for a screen reader, as its words.
 * Unmeasured: a muted "?", with `libyearsReason` the same way.
 *
 * On paper (PD-PRINT-4) the cell keeps its printed form: the value and the short mark beside a zero.
 */
function LibyearsCell({ finding, max }: { finding: Finding; max: number | null }) {
  const { model } = useReport();
  const printed = usePrinted();
  const value = fixed(finding.libyears, 1);
  const metadata = model.details.get(finding.package)?.metadata ?? null;
  if (value === null) {
    const why = `not measured: ${libyearsReason(finding)}`;
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

/**
 * S1 to S10 as a row of ten dots under the column head's own S1…S10 caption (PD-PACKAGES-2): filled
 * in the level's tone where the signal fired (`checks.ts#levelTone`, the detail's strip's own
 * tones), ringed where S10 says the check could not run, a faint point otherwise — so a column of
 * them reads down the list as a matrix, which "S1 S2 S3 S4" text did not. The dots are decoration;
 * the fired ids are the cell's words, and a signal newer than S10 is named after the dots. On
 * paper, the ids as text.
 */
function SignalsCell({ finding }: { finding: Finding }) {
  const printed = usePrinted();
  const ids = finding.signals.map((signal) => signal.id);
  if (printed) return <>{ids.join(" ") || "—"}</>;
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
      {strip.unknown.length > 0 && <span className="sig-dots-more"> +{strip.unknown.join(" ")}</span>}
    </span>
  );
}

/** "vendor/" then the name, which moves to a line of its own whole rather than breaking at a
 *  hyphen, when the stacked rows are too narrow for both (packages.css `.pk-unit`). */
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
  // The phone layout draws the priority as the row's left rule (packages.css): its tone, and in
  // forced colours — where every tone is the one system ink — its weight, by `prio-<word>`. A row
  // with none has no rule to draw.
  const rowClass =
    finding.priority === "none"
      ? "pk-row"
      : `pk-row has-prio prio-${finding.priority} ${toneClass(TONE(finding.priority))}`;

  return (
    <tr
      className={rowClass}
      tabIndex={rowTabIndex(finding.package, cursor)}
      aria-current={isOpen ? "true" : undefined}
      aria-label={finding.package}
      data-pkg={finding.package}
      {...openInteractions(finding.package, dispatch)}
    >
      <td className="pk-name">
        <PackageCell finding={finding} />
        {finding.advisories.length > 0 && (
          <>
            {" "}
            <AdvisoryChip finding={finding} />
          </>
        )}
        <MatchNote hit={hit} />
      </td>
      <td className="num pk-ver">{finding.version}</td>
      <td className="num pk-ly">
        <LibyearsCell finding={finding} max={max} />
      </td>
      <td className="pk-verdict">
        <Pill word={finding.verdict} />
      </td>
      <td className="pk-prio">
        {finding.priority === "none" ? <Muted>—</Muted> : <Pill word={finding.priority} />}
      </td>
      <td className="pk-reach">
        {finding.direct ? "direct" : "transitive"}
        {finding.dev ? " · dev" : ""}
      </td>
      <td className="num pk-sig">
        <SignalsCell finding={finding} />
      </td>
      {dated && <td className="num pk-data">{day(finding.dataDate)}</td>}
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

/**
 * The list's answer and key, above the table (PD-PACKAGES-1): how many of the listed packages are
 * behind their newest stable release, how many are not, how many could not be measured — counts of
 * the libyears cells below, nothing more — then what the cells' two marks mean, said once here
 * instead of on every row. Paper keeps its own printed lede (PrintDocument), so none is drawn there.
 *
 * Two of the key's items are for the stacked rows only (PD-PACKAGES-3, packages.css
 * `.pk-key-narrow`): there the table's head is a sort bar that has no room for the Libyears head's
 * 0…Ny scale or a Priority column, so the key says what a full bar is and what the row's left rule
 * is.
 */
function PackagesLede({ tally, listed, max }: { tally: LibyearsTally; listed: number; max: number | null }) {
  const { behind, current, unmeasured } = tally;
  return (
    <div className="pk-lede">
      <p className="pk-answer">
        <Count n={behind} /> of the <b>{listed}</b> listed {behind === 1 ? "is" : "are"} behind{" "}
        {behind === 1 ? "its" : "their"} newest stable release
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
          <span className="pk-key-item pk-key-narrow">
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
            not behind its newest stable
          </span>
        )}
        {unmeasured > 0 && (
          <span className="pk-key-item">
            <span className="pk-key-mark" aria-hidden="true">
              ?
            </span>{" "}
            not measured
          </span>
        )}
        {(current > 0 || unmeasured > 0) && (
          <span className="pk-key-item pk-key-hover">hover either for why</span>
        )}
        <span className="pk-key-item pk-key-narrow" aria-hidden="true">
          <span className="pk-key-rule" /> left rule: priority
        </span>
      </p>
    </div>
  );
}

/** The Libyears head's scale, over the bars' track: 0 at its left end, the scale's edge at its right
 *  (PD-PACKAGES-1). A caption, so it is hidden from a screen reader; the head's own title says it. */
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

/** The All packages tab: every package in the document, sortable by column — ported from legacy
 *  `viewPackages` (report.js:558-593), fixed per DESIGN.md §5 M6: rows are focusable and mark the
 *  open package, which legacy's plain `<tr>` never did — with `aria-current`, as every other tab's
 *  rows do (PD-ROWS-12): `aria-selected` means nothing on a plain table's row. Under 480px of list
 *  the table's rows stack, two lines each (PD-PACKAGES-3, packages.css): one table, restyled, so
 *  the rows, their order and their keyboard contract stay the same at every width. */
export function PackagesView() {
  const { model, state, dispatch } = useReport();
  const printed = usePrinted();
  const visible = applyFilters(model, state, "packages");
  const activeSort: SortKey = state.sort;
  // On paper a column of one repeated date is dropped; the printed section's lede gives it once.
  const dated = !printed || sharedDataDay(visible) === null;
  const columns = dated ? COLUMNS : COLUMNS.filter((column) => column.key !== "data");
  const max = printed ? null : libyearsAxisMax(population(model, "packages"));

  if (visible.length === 0) {
    return <EmptyState reason={population(model, "packages").length === 0 ? "clean" : "filtered"} />;
  }

  return (
    <div className="pk">
      {!printed && <PackagesLede tally={libyearsTally(visible)} listed={visible.length} max={max} />}
      <div className="tablewrap">
        <table className="pk-table">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = column.key === activeSort;
                const sort = active ? (state.sortDesc ? "descending" : "ascending") : "none";
                const arrow = active ? (state.sortDesc ? " ↓" : " ↑") : "";
                // A heading's button is not repeated on a continuation page (Chromium prints the
                // repeated head blank), so paper gets the words themselves.
                if (printed) {
                  return (
                    <th key={column.key} aria-sort={sort}>
                      {column.label}
                      {arrow}
                    </th>
                  );
                }
                return (
                  <th key={column.key} className={column.cell} aria-sort={sort} title={column.title}>
                    <button
                      type="button"
                      className={`sort-btn${active ? " active" : ""}`}
                      onClick={() => {
                        dispatch({ type: "sort", key: column.key });
                      }}
                    >
                      {column.label}
                      {arrow}
                    </button>
                    {column.key === "libyears" && max !== null && <LibyearsAxis max={max} />}
                    {column.key === "signals" && <SignalsAxis />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((finding) => (
              <PackageRow key={finding.package} finding={finding} dated={dated} max={max} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
