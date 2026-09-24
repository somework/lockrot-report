import type { Finding } from "../../model/types";
import { applyFilters, population } from "../../domain/filters";
import { packagistUrl, repoHost, safeHref } from "../../domain/links";
import { OutLink, Pill, Tag } from "../common/common";
import { useReport, type ReportContextValue } from "../context";
import "./detail.css";

export interface DetailHeaderProps {
  readonly finding: Finding;
  readonly onClose: () => void;
}

/**
 * PD-DETAIL-4 (DESIGN.md §5): "the detail survives a filter that hides its package" is kept on
 * purpose (§5's own "deliberately kept" list), but a reader who switched tabs or typed a search
 * term and then found the open package silent about that had no way to tell the two apart from "no
 * findings match". True only when the package belongs to the current tab's own population but the
 * query box or the rail filters it out there — never for a package the tab never lists at all (an
 * `ok` package while on the Findings tab, say), which is a different fact this line does not claim.
 */
function hiddenByFilters(finding: Finding, deps: ReportContextValue): boolean {
  const { model, state } = deps;
  const inTab = population(model, state.view).some((f) => f.package === finding.package);
  if (!inTab) return false;
  return !applyFilters(model, state, state.view).some((f) => f.package === finding.package);
}

/**
 * The detail panel's header — name, verdict/priority pills, scope tags, and the outbound links.
 * Ported from legacy `renderDetail`'s `detail-head` (`report.js:781-796`).
 *
 * The replacement link only exists for `finding.replacement`, a Composer package name lockrot
 * itself resolved; `metadata.replacement` is Packagist's own free text and has nowhere safe to link
 * to, so it is shown as plain text instead (critic.md M32 — the composed Packagist URL is still
 * `safeHref`-checked by `OutLink`, that check just never runs on the free-text value).
 */
export function DetailHeader({ finding, onClose }: DetailHeaderProps) {
  const report = useReport();
  const { model, dispatch } = report;
  const details = model.details.get(finding.package) ?? null;
  const packagist = packagistUrl(finding, model.details);
  const repositoryLink = safeHref(details?.repositoryLink ?? null);
  const replacement = finding.replacement ?? details?.metadata?.replacement ?? null;
  const hidden = hiddenByFilters(finding, report);

  return (
    <div className="detail-head">
      <div className="detail-head-top">
        <div className="detail-head-main">
          <h2 className="detail-title">{finding.package}</h2>
          <div className="detail-pills">
            <Pill word={finding.verdict} docs />
            {finding.priority !== "none" && <Pill word={finding.priority} />}
            <Tag>{finding.direct ? "direct" : "transitive"}</Tag>
            {finding.dev && <Tag>require-dev</Tag>}
          </div>
          <div className="detail-links">
            {packagist !== null && <OutLink href={packagist}>packagist</OutLink>}
            {repositoryLink !== null && <OutLink href={repositoryLink}>{repoHost(repositoryLink)}</OutLink>}
            {replacement !== null &&
              (finding.replacement !== null ? (
                <OutLink
                  href={`https://packagist.org/packages/${replacement}`}
                >{`replacement: ${replacement}`}</OutLink>
              ) : (
                <span className="detail-replacement-text">{`replacement: ${replacement}`}</span>
              ))}
          </div>
          {hidden && (
            <p className="detail-hidden-note">
              Hidden by the current filters.
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  dispatch({ type: "clear" });
                }}
              >
                Clear filters
              </button>
            </p>
          )}
        </div>
        <button type="button" className="detail-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
