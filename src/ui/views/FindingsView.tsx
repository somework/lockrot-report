import type { Finding } from "../../model/types";
import { useReport } from "../context";
import { applyFilters, population } from "../../domain/filters";
import { plural } from "../../domain/format";
import { toneClass } from "../common/common";
import { TONE } from "../../domain/vocab";
import { FindingRow } from "./FindingRow";
import { EmptyState } from "./EmptyState";
import "./views.css";

/**
 * The note above the list naming packages that carry a security advisory but landed on `ok` or
 * `finished` — so they never appear in this tab at all. Ported from legacy `viewFindings`
 * (report.js:451-463), kept exactly as legacy computed it (DESIGN.md §5 M27 is not one of the fixed
 * differences): the note reads over *every* finding, ignoring the query box and the rail, and is
 * shown above the list or the empty state whatever is currently filtered.
 */
function QuietNote({ quiet }: { quiet: readonly Finding[] }) {
  const { dispatch } = useReport();
  const many = quiet.length > 1;

  return (
    <div className="note">
      {plural(quiet.length, "package", "packages")} {many ? "carry" : "carries"} a security advisory but no
      rot verdict, so {many ? "they are" : "it is"} not in this list:{" "}
      {quiet.map((finding) => (
        <button
          key={finding.package}
          type="button"
          className="pkg-link-btn"
          onClick={() => {
            dispatch({ type: "select", pkg: finding.package });
          }}
        >
          {finding.package}
        </button>
      ))}{" "}
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          dispatch({ type: "view", view: "advisories", keepDetail: true });
        }}
      >
        See the advisories
      </button>
    </div>
  );
}

/** Buckets an already priority-ordered list into contiguous runs sharing one `priority` — `visible`
 *  arrives from `applyFilters` already grouped that way (`filters.ts`'s `orderByPriorityGroup`), so
 *  finding a run boundary is enough; this never re-sorts or re-derives the grouping itself. */
function groupByPriority(findings: readonly Finding[]): { priority: string; findings: Finding[] }[] {
  const groups: { priority: string; findings: Finding[] }[] = [];
  for (const finding of findings) {
    const current = groups.at(-1);
    if (current && current.priority === finding.priority) current.findings.push(finding);
    else groups.push({ priority: finding.priority, findings: [finding] });
  }
  return groups;
}

/** The Findings tab: the report's headline list, one priority-grouped section of rows at a time.
 *  Ported from legacy `viewFindings` (report.js:448-478). */
export function FindingsView() {
  const { model, state } = useReport();
  const quiet = model.report.findings.filter(
    (finding) =>
      finding.advisories.length > 0 && (finding.verdict === "ok" || finding.verdict === "finished"),
  );
  const visible = applyFilters(model, state, "findings");

  return (
    <div>
      {quiet.length > 0 && <QuietNote quiet={quiet} />}
      {visible.length === 0 ? (
        <EmptyState reason={population(model, "findings").length === 0 ? "clean" : "filtered"} />
      ) : (
        groupByPriority(visible).map((group) => (
          <section className="group" key={group.priority}>
            <div className="group-head">
              <h2 className={toneClass(TONE(group.priority))}>{group.priority}</h2>
              <span className="mono muted group-count">
                {plural(group.findings.length, "package", "packages")}
              </span>
            </div>
            <ul className="rows" aria-label={`${group.priority} priority`}>
              {group.findings.map((finding) => (
                <FindingRow key={finding.package} finding={finding} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
