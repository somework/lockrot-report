import type { Finding } from "../../model/types";
import { advisoriesOf, fixLadder, noFixWords, sevTone, sortAdvisories } from "../../domain/advisories";
import { cveUrl } from "../../domain/links";
import { day, plural } from "../../domain/format";
import { OutLink, toneClass } from "../common/common";
import "./detail.css";

/** "N security advisories": the fix ladder, then every advisory; nothing for a finding with none. */
export function AdvisoryList({ finding }: { finding: Finding }) {
  const advisories = advisoriesOf(finding);
  if (advisories.length === 0) return null;

  const ladder = fixLadder(finding);
  const sorted = sortAdvisories(advisories, (advisory) => advisory.severity);

  return (
    <section className="detail-section">
      <h3>{plural(advisories.length, "security advisory", "security advisories")}</h3>
      <div className="detail-ladder">
        {ladder.map((rung) => (
          <div
            key={rung.version ?? (rung.unchecked ? "\u0000unchecked" : "\u0000none")}
            className={rung.onBranch ? "detail-rung detail-rung-here" : "detail-rung"}
          >
            <span className="detail-rung-version">
              {rung.version ?? (rung.unchecked ? "not checked" : "no release")}
            </span>
            <span className="detail-rung-bar">
              <i style={{ width: `${Math.round((100 * rung.n) / advisories.length)}%` }} />
            </span>
            <span className="detail-rung-count">
              {!rung.unchecked && "clears "}
              {rung.n} of {advisories.length}
              {rung.onBranch && " · this branch"}
            </span>
          </div>
        ))}
      </div>
      <details className="detail-signal-more detail-disclosure">
        <summary className="detail-signal-summary">
          <span className="detail-signal-summary-text">Every advisory</span>
        </summary>
        <div className="detail-advisory-list">
          {sorted.map((advisory) => {
            const cve = cveUrl(advisory);

            return (
              <div key={advisory.id} className="detail-advisory">
                <span className={`detail-advisory-sev ${toneClass(sevTone(advisory.severity))}`}>
                  {advisory.severityRaw ?? "unrated"}
                </span>
                <span className="detail-advisory-title">{advisory.title ?? advisory.id}</span>
                <span className="detail-advisory-meta">
                  {cve !== null ? (
                    <OutLink href={cve}>{advisory.cve}</OutLink>
                  ) : (
                    <span className="mono">{advisory.cve ?? advisory.id}</span>
                  )}
                  <span>{advisory.fixedBy ? `fixed by ${advisory.fixedBy}` : noFixWords(advisory)}</span>
                  <span>reported {day(advisory.reportedAt)}</span>
                  {advisory.link !== null && <OutLink href={advisory.link}>advisory</OutLink>}
                </span>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
