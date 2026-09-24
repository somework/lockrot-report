import { useRef } from "preact/hooks";
import type { Finding } from "../../model/types";
import { hiddenByFilters } from "../../domain/filters";
import { packagistUrl, repoHost, safeHref } from "../../domain/links";
import { OutLink, Pill, Tag } from "../common/common";
import { useReport } from "../context";
import "./detail.css";

export interface DetailHeaderProps {
  readonly finding: Finding;
  readonly onClose: () => void;
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
  const { model, state, dispatch } = useReport();
  const details = model.details.get(finding.package) ?? null;
  const packagist = packagistUrl(finding, model.details);
  const repositoryLink = safeHref(details?.repositoryLink ?? null);
  const replacement = finding.replacement ?? details?.metadata?.replacement ?? null;
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
                  closeRef.current?.focus();
                }}
              >
                Clear filters
              </button>
            </p>
          )}
        </div>
        <button type="button" ref={closeRef} className="detail-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
