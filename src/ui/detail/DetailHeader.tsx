import { useRef } from "preact/hooks";
import type { Finding } from "../../model/types";
import { hiddenByFilters } from "../../domain/filters";
import { packagistUrl, repoHost, safeHref } from "../../domain/links";
import { OutLink, Pill } from "../common/common";
import { useReport } from "../context";
import "./detail.css";

export interface DetailHeaderProps {
  readonly finding: Finding;
  readonly onClose: () => void;
}

/**
 * The detail panel's header — the package and its installed version, the verdict and priority
 * pills with the outbound links on the same line (PD-DETAIL-6, DESIGN.md §5). Ported from legacy
 * `renderDetail`'s `detail-head` (`report.js:781-796`). The direct/transitive and require-dev tags
 * and the "replacement:" link moved into the answer below (`DetailLead.tsx`), which says both in a
 * sentence; this header stays short because it is the part of the panel that sticks.
 *
 * The replacement is only ever linked when it is `finding.replacement`, a Composer package name
 * lockrot itself resolved; `metadata.replacement` is Packagist's own free text and has nowhere safe
 * to link to, so it is plain text (critic.md M32, `domain/answer.ts`).
 */
export function DetailHeader({ finding, onClose }: DetailHeaderProps) {
  const { model, state, dispatch } = useReport();
  const details = model.details.get(finding.package) ?? null;
  const packagist = packagistUrl(finding, model.details);
  const repositoryLink = safeHref(details?.repositoryLink ?? null);
  const hidden = hiddenByFilters(model, state, finding.package);
  // a11y/regression review: "Clear filters" used to leave keyboard focus nowhere. `dispatch` makes
  // `hidden` false in the same tick, which unmounts this very button — by the time the click handler
  // would try to move focus onward, the element it ran on is already gone, and the browser drops
  // focus to <body> (WCAG 2.4.3). `closeRef` names the one control in this header that survives every
  // state this component renders — the panel's own Close button — so focus always lands somewhere,
  // read fresh rather than through a state that would need a render to catch up (App.tsx's own
  // `rowRequest` pattern is for a row that has yet to exist; this one already does).
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="detail-head">
      <div className="detail-head-top">
        <div className="detail-head-name">
          <h2 className="detail-title">{finding.package}</h2>
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
          {packagist !== null && <OutLink href={packagist}>packagist</OutLink>}
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
