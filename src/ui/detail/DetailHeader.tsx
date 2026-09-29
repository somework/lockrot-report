import { useRef } from "preact/hooks";
import type { Finding } from "../../model/types";
import { hiddenByFilters } from "../../domain/filters";
import { registryLink, repoHost, safeHref } from "../../domain/links";
import { OutLink, Pill } from "../common/common";
import { useReport } from "../context";
import "./detail.css";

export interface DetailHeaderProps {
  readonly finding: Finding;
  readonly onClose: () => void;
}

/** The panel's sticky header: package, version, verdict and priority pills, outbound links (PD-DETAIL-6). */
export function DetailHeader({ finding, onClose }: DetailHeaderProps) {
  const { model, state, dispatch } = useReport();
  const details = model.details.get(finding.package) ?? null;
  const registry = registryLink(finding);
  const repositoryLink = safeHref(details?.repositoryLink ?? null);
  const hidden = hiddenByFilters(model, state, finding.package);
  // `dispatch` unmounts the Clear-filters button, so focus goes to Close, which every state keeps.
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="detail-head">
      <div className="detail-head-top">
        <div className="detail-head-name">
          {/* Where focus goes when the detail opens as a sheet over the page (PD-ROWS-12): the row
              that opened it is covered, so its ring would be out of sight. */}
          <h2 className="detail-title" tabIndex={-1} data-detail-focus="">
            {finding.package}
          </h2>
          <span className="detail-version">{finding.version}</span>
        </div>
        <button type="button" ref={closeRef} className="detail-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="detail-head-line">
        <div className="detail-pills">
          {/* `docs`, unlike the same verdict's pill in its own row (`views/FindingRow.tsx`,
              PD-GLOSSARY-4/5, DESIGN.md §5): a pill up here is not also the row's own click
              target, so a definition popover is what a reader wants from it. */}
          <Pill word={finding.verdict} docs />
          {finding.priority !== "none" && <Pill word={finding.priority} />}
        </div>
        <div className="detail-links">
          {registry !== null && (
            <OutLink href={registry.href} title={registry.title}>
              {registry.label}
            </OutLink>
          )}
          {repositoryLink !== null && <OutLink href={repositoryLink}>{repoHost(repositoryLink)}</OutLink>}
        </div>
      </div>
      {hidden && (
        <p className="detail-hidden-note">
          Hidden by the current filters.
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              dispatch({ type: "clear" });
              closeRef.current?.focus();
            }}
          >
            Clear filters
          </button>
        </p>
      )}
    </div>
  );
}
