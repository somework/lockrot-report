import type { Finding } from "../../model/types";
import type { SortKey } from "../../state/types";
import { useReport } from "../context";
import { applyFilters, population } from "../../domain/filters";
import { packagistUrl } from "../../domain/links";
import { day, fixed } from "../../domain/format";
import { libyearsAtZero, libyearsReason } from "../../domain/libyears";
import { Pill, Muted } from "../common/common";
import { innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "./FindingRow";
import { EmptyState } from "./EmptyState";
import "./views.css";

/** Column headers in display order, matching the accessible names `e2e/support/new.ts` expects
 *  (`SORT_LABEL`) and legacy's own column titles (report.js:581-584). Only Libyears carries a
 *  tooltip explaining what an unmeasured dash means. */
const COLUMNS: readonly { key: SortKey; label: string; title?: string }[] = [
  { key: "package", label: "Package" },
  { key: "version", label: "Version" },
  {
    key: "libyears",
    label: "Libyears",
    title:
      "Years between the installed release and the package's newest stable release; a dash is a package that could not be measured, and says why on hover",
  },
  { key: "verdict", label: "Verdict" },
  { key: "priority", label: "Priority" },
  { key: "reached", label: "Reached" },
  { key: "signals", label: "Signals" },
  { key: "data", label: "Data as of" },
];

/**
 * `0.0` reads as "fresh" next to an abandoned or silent package (a walk found this on wallabag's own
 * lock) — it is a clamped difference of release dates (`domain/libyears.ts#libyearsAtZero`'s own
 * comment), not an age. Where it lands on zero because the installed release is the one lockrot
 * measured everything else against, this says so, in the domain's own words rather than a new one
 * invented here; a measured-but-not-zero value carries no such note; there is no clamping to explain.
 */
function LibyearsCell({ finding }: { finding: Finding }) {
  const { model } = useReport();
  const value = fixed(finding.libyears, 1);
  if (value === null) {
    return <Muted title={`not measured: ${libyearsReason(finding)}`}>—</Muted>;
  }
  const metadata = model.details.get(finding.package)?.metadata ?? null;
  const zeroReason = libyearsAtZero(finding, metadata);

  return (
    <>
      {value}
      {zeroReason !== null && <Muted> · {zeroReason}</Muted>}
    </>
  );
}

function PackageCell({ finding }: { finding: Finding }) {
  const { model, cursor } = useReport();
  const url = packagistUrl(finding, model.details);
  if (url === null) return <>{finding.package}</>;

  return (
    <a
      className="lnk"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={innerTabIndex(finding.package, cursor)}
    >
      {finding.package}
    </a>
  );
}

function PackageRow({ finding }: { finding: Finding }) {
  const { state, dispatch, cursor } = useReport();
  const isOpen = state.pkg === finding.package;

  return (
    <tr
      tabIndex={rowTabIndex(finding.package, cursor)}
      aria-selected={isOpen}
      aria-label={finding.package}
      data-pkg={finding.package}
      {...openInteractions(finding.package, dispatch)}
    >
      <td>
        <PackageCell finding={finding} />
      </td>
      <td className="num">{finding.version}</td>
      <td className="num">
        <LibyearsCell finding={finding} />
      </td>
      <td>
        <Pill word={finding.verdict} />
      </td>
      <td>{finding.priority === "none" ? <Muted>—</Muted> : <Pill word={finding.priority} />}</td>
      <td>
        {finding.direct ? "direct" : "transitive"}
        {finding.dev ? " · dev" : ""}
      </td>
      <td className="num">{finding.signals.map((signal) => signal.id).join(" ") || "—"}</td>
      <td className="num">{day(finding.dataDate)}</td>
    </tr>
  );
}

/** The All-packages tab: every package in the document, sortable by column — ported from legacy
 *  `viewPackages` (report.js:558-593), fixed per DESIGN.md §5 M6: rows are focusable and mark the
 *  open package selected, which legacy's plain `<tr>` never did. */
export function PackagesView() {
  const { model, state, dispatch } = useReport();
  const visible = applyFilters(model, state, "packages");
  const activeSort: SortKey = state.sort;

  if (visible.length === 0) {
    return <EmptyState reason={population(model, "packages").length === 0 ? "clean" : "filtered"} />;
  }

  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const active = column.key === activeSort;
              const sort = active ? (state.sortDesc ? "descending" : "ascending") : "none";
              return (
                <th key={column.key} aria-sort={sort} title={column.title}>
                  <button
                    type="button"
                    className={`sort-btn${active ? " active" : ""}`}
                    onClick={() => {
                      dispatch({ type: "sort", key: column.key });
                    }}
                  >
                    {column.label}
                    {active ? (state.sortDesc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((finding) => (
            <PackageRow key={finding.package} finding={finding} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
