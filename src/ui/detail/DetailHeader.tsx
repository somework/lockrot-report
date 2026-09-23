import type { Finding } from "../../model/types";
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
  const { model } = useReport();
  const details = model.details.get(finding.package) ?? null;
  const packagist = packagistUrl(finding, model.details);
  const repositoryLink = safeHref(details?.repositoryLink ?? null);
  const replacement = finding.replacement ?? details?.metadata?.replacement ?? null;

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
        </div>
        <button type="button" className="detail-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
