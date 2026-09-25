import type { Advisory, Finding } from "../../model/types";
import type { AdvisoryWithFinding } from "../../domain/advisories";
import { useReport } from "../context";
import { population } from "../../domain/filters";
import { sevTone } from "../../domain/advisories";
import { cveUrl } from "../../domain/links";
import { day, ageText } from "../../domain/format";
import { Tag, OutLink, NoWrap } from "../common/common";
import { innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "./FindingRow";
import { EmptyState } from "./EmptyState";
import { advisoryGroupsFor } from "./order";
import "./views.css";

/** The fix-cost sentence for one advisory, verbatim from legacy `advRow` (report.js:482-484). */
function fixText(advisory: Advisory): string {
  if (!advisory.fixedBy) return "no fix listed";
  return advisory.fixedOnBranch
    ? `fixed by ${advisory.fixedBy} on this branch`
    : `fixed only by ${advisory.fixedBy}`;
}

function AdvisoryRow({ finding, advisory }: { finding: Finding; advisory: Advisory }) {
  const { state, dispatch, now, cursor } = useReport();
  const isOpen = state.pkg === finding.package;
  const inner = innerTabIndex(finding.package, cursor);
  const cve = cveUrl(advisory);
  const openedAgo = advisory.reportedAt ? ageText(advisory.reportedAt, now).replace(" ago", "") : null;

  return (
    <li
      tabIndex={rowTabIndex(finding.package, cursor)}
      aria-current={isOpen ? "true" : undefined}
      aria-label={finding.package}
      data-pkg={finding.package}
      className="adv"
      {...openInteractions(finding.package, dispatch)}
    >
      <Tag tone={sevTone(advisory.severity)}>{advisory.severityRaw ?? "unrated"}</Tag>
      <span className="t">{advisory.title ?? advisory.id}</span>
      <span className="m">
        <span className="mono">
          {finding.package} {finding.version}
        </span>
        {cve !== null ? (
          <OutLink href={cve} tabIndex={inner}>
            {advisory.cve}
          </OutLink>
        ) : (
          <span className="mono">{advisory.cve ?? advisory.id}</span>
        )}
        <span>{fixText(advisory)}</span>
        <span>affects {advisory.affectedVersions ?? "?"}</span>
        <span>
          reported <NoWrap>{day(advisory.reportedAt)}</NoWrap>
          {openedAgo !== null ? `, open ${openedAgo}` : ""}
        </span>
        {advisory.link && (
          <OutLink href={advisory.link} tabIndex={inner}>
            advisory
          </OutLink>
        )}
      </span>
    </li>
  );
}

function advisoryKey(pair: AdvisoryWithFinding): string {
  return `${pair.finding.package}:${pair.advisory.id}`;
}

/** The Advisories tab: every advisory in the document, grouped by what fixing it costs — ported
 *  from legacy `viewAdvisories`/`advRow` (report.js:480-546). */
export function AdvisoriesView() {
  const { model, state } = useReport();
  const groups = advisoryGroupsFor(model, state);

  if (groups.length === 0) {
    return <EmptyState reason={population(model, "advisories").length === 0 ? "clean" : "filtered"} />;
  }

  return (
    <div>
      {groups.map((group) => (
        <section className="advgroup" key={group.shape}>
          <header>
            <h2>{group.heading}</h2>
            <span className="mono muted">{group.advisories.length}</span>
            <p>{group.hint}</p>
          </header>
          <ul className="adv-list" aria-label={group.heading}>
            {group.advisories.map((pair) => (
              <AdvisoryRow key={advisoryKey(pair)} finding={pair.finding} advisory={pair.advisory} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
