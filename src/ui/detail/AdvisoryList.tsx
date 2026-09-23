import type { Finding } from "../../model/types";
import { advisoriesOf, fixLadder, sevTone, sortAdvisories } from "../../domain/advisories";
import { cveUrl } from "../../domain/links";
import { day, plural } from "../../domain/format";
import { OutLink, toneClass } from "../common/common";
import "./detail.css";

/**
 * "N security advisories": the fix ladder and the full advisory list, ported from legacy's advisory
 * block inside `renderDetail` (`report.js:805-831`) and `fixLadder` (`report.js:160-171`, now
 * `domain/advisories.ts`, critic.md M33). Omitted entirely for a finding with no advisory —
 * `advisoriesOf(finding).length === 0` is exactly legacy's `advisoriesOf(f).length` guard.
 */
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
            key={rung.version ?? "\u0000none"}
            className={rung.onBranch ? "detail-rung detail-rung-here" : "detail-rung"}
          >
            <span className="detail-rung-version">{rung.version ?? "no release"}</span>
            <span className="detail-rung-bar">
              <i style={{ width: `${Math.round((100 * rung.n) / advisories.length)}%` }} />
            </span>
            <span className="detail-rung-count">
              clears {rung.n} of {advisories.length}
              {rung.onBranch && " · this branch"}
            </span>
          </div>
        ))}
      </div>
      {/* A plain <details>, styled transparent, exactly as legacy nested the full list under the
          ladder (report.js:829: `class="signal" style="background:transparent"`). */}
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
                  <span>{advisory.fixedBy ? `fixed by ${advisory.fixedBy}` : "no fix listed"}</span>
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
