import { Fragment } from "preact";
import type { ComponentChildren } from "preact";
import type { Finding, PackageDetails } from "../../model/types";
import { ageFact, ageNotRead, ageZone } from "../../domain/age";
import {
  answerParts,
  pulledIn,
  pulledVerdicts,
  type AnswerPart,
  type PulledEntry,
} from "../../domain/answer";
import { ageText, fixed } from "../../domain/format";
import { Muted, OutLink, toneClass } from "../common/common";
import { useReport } from "../context";
import "./detail-lead.css";

/**
 * The top of the open package (PD-DETAIL-6, DESIGN.md §5): one answer sentence in the serif the
 * summary band and the release-branches answer already speak in, the four facts a reader checks
 * first, then how the package gets in and what flagged packages it pulls in. Every word comes from
 * `domain/answer.ts` or from a field the rest of the panel shows in full further down; nothing here
 * is a recommendation.
 */
export function DetailLead({ finding, details }: { finding: Finding; details: PackageDetails | null }) {
  const { model } = useReport();
  const parts = answerParts({
    finding,
    metadataReplacement: details?.metadata?.replacement ?? null,
    thresholds: model.report.run.thresholds,
  });

  return (
    <div className="detail-lead">
      <p className="detail-answer">
        {parts.map((part, index) => (
          <AnswerNode key={index} part={part} />
        ))}
      </p>
      <Facts finding={finding} details={details} />
      <dl className="detail-paths">
        <div className="detail-path">
          <dt>How it gets in</dt>
          <dd>
            <Chain finding={finding} />
          </dd>
        </div>
        <PullsIn finding={finding} />
      </dl>
    </div>
  );
}

function AnswerNode({ part }: { part: AnswerPart }) {
  switch (part.kind) {
    case "text":
      return <>{part.text}</>;
    case "name":
      return <span className="detail-answer-name">{part.text}</span>;
    case "figure":
      return (
        <b
          className={
            part.tone === null
              ? "detail-answer-figure"
              : `detail-answer-figure is-toned ${toneClass(part.tone)}`
          }
        >
          {part.text}
        </b>
      );
    case "replacement":
      return part.linked ? (
        <b className="detail-answer-replacement">
          <OutLink href={`https://packagist.org/packages/${part.text}`}>{part.text}</OutLink>
        </b>
      ) : (
        <b className="detail-answer-replacement">{part.text}</b>
      );
  }
}

/** "3.6 y ago" / "7 mo ago", from a signal's own years — the unit `ageText` gives a date. */
function yearsAgo(years: number): string {
  return years < 1 ? `${Math.max(1, Math.round(years * 12))} mo ago` : `${years.toFixed(1)} y ago`;
}

interface Fact {
  readonly label: string;
  readonly value: ComponentChildren;
  readonly wide?: boolean;
}

function Facts({ finding, details }: { finding: Finding; details: PackageDetails | null }) {
  const { model, now } = useReport();
  const lock = details?.lock ?? null;
  const facts: Fact[] = [
    { label: "Installed", value: finding.version },
    ageFactCell(finding, details?.metadata?.installedRelease ?? lock?.released ?? null),
  ];
  const libyears = fixed(finding.libyears, 1);
  facts.push({ label: "Libyears", value: libyears ?? <Muted>not measured</Muted> });
  if (lock?.php) facts.push({ label: "PHP", value: lock.php, wide: lock.php.length > 14 });

  return (
    <dl className="detail-facts">
      {facts.map((fact) => (
        <div key={fact.label} className={fact.wide ? "detail-fact is-wide" : "detail-fact"}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );

  /** The age the Findings row draws for this package (`age.ts#ageFact`, S8 > S2 > S4), labelled by
   *  which signal supplied it and in its zone's tone unless the verdict does not rest on age. With no
   *  such signal it falls back to the installed release's own date (the explain metadata's, then the
   *  lock's), and failing that says why: lockrot could not read it, or the document has none. */
  function ageFactCell(f: Finding, released: string | null): Fact {
    const fact = ageFact(f, model.report.run.thresholds);
    if (fact !== null) {
      const label =
        fact.kind === "branch" ? "Branch released" : fact.kind === "push" ? "Last push" : "Last release";
      const tone = fact.contextOnly ? null : ageZone(fact.years, fact.warn, fact.high);
      return {
        label,
        value: (
          <span className={tone === null ? undefined : `detail-fact-toned ${toneClass(tone)}`}>
            {yearsAgo(fact.years)}
          </span>
        ),
      };
    }
    // A snapshot's lock date is when a branch was checked out, not a release (the release-branches
    // answer draws the same distinction), so it is labelled as a date, never as a release.
    const snapshot = f.verdict === "pinned" || f.signals.some((s) => s.id === "S6");
    if (released) return { label: snapshot ? "Snapshot dated" : "Released", value: ageText(released, now) };
    return {
      label: "Last release",
      value: <Muted>{ageNotRead(f) ? "not read" : "not recorded"}</Muted>,
    };
  }
}

/**
 * `composer.json › first hop › … › this package`. A hop that is itself a finding in this report is a
 * button that opens it, through the same `select` every row sends, so the hash and focus follow the
 * rules they already follow. `finding.chain` already ends with the package (Model's own comment);
 * a direct finding's chain is just itself.
 */
function Chain({ finding }: { finding: Finding }) {
  const { model, dispatch } = useReport();
  const hops = finding.chain.length > 0 ? finding.chain : [finding.package];
  const flagged = new Set(model.report.findings.map((f) => f.package));
  const others = finding.directDependents.filter((pkg) => pkg !== hops[0] && pkg !== finding.package);

  return (
    <>
      <span className="detail-chain">
        <span className="detail-hop is-root">composer.json</span>
        {hops.map((pkg) => (
          <Fragment key={pkg}>
            <span className="detail-hop-sep" aria-hidden="true">
              ›
            </span>
            {pkg === finding.package ? (
              <span className="detail-hop is-self">{pkg}</span>
            ) : flagged.has(pkg) ? (
              <button
                type="button"
                className="detail-hop-link"
                title={`Open ${pkg}`}
                onClick={() => {
                  dispatch({ type: "select", pkg });
                }}
              >
                {pkg}
              </button>
            ) : (
              <span className="detail-hop">{pkg}</span>
            )}
          </Fragment>
        ))}
        {finding.dev && <span className="detail-hop-note">require-dev</span>}
      </span>
      {others.length > 0 && (
        <span className="detail-chain-also">
          Also required through{" "}
          {others.length === 1 ? (
            <span className="mono">{others[0]}</span>
          ) : (
            `${others.length} other packages`
          )}
          .
        </span>
      )}
    </>
  );
}

/** The most entries "What it pulls in" names one by one; past it, the line counts them by verdict
 *  instead, since a longer run of names is the bare package list a reader cannot take in (S7's own
 *  detail below still names every one). */
const PULLS_IN_NAMED = 4;

/** "a, b and c" with each item already a node. */
function joinAnd(items: readonly ComponentChildren[]): ComponentChildren[] {
  return items.flatMap((item, i) => (i === 0 ? [item] : [i === items.length - 1 ? " and " : ", ", item]));
}

function PullsIn({ finding }: { finding: Finding }) {
  const pulled = pulledIn(finding);
  if (pulled === null) return null;

  const named = pulled.entries.length <= PULLS_IN_NAMED;
  return (
    <div className="detail-path">
      <dt>
        What it pulls in · <span className="detail-path-count">{pulled.flagged} flagged</span>
      </dt>
      <dd className="detail-pulls">
        {named ? (
          joinAnd(
            pulled.entries.map((entry) => (
              <PulledNode key={entry.vendor ?? entry.packages[0]} entry={entry} />
            )),
          )
        ) : (
          <>
            {joinAnd(
              pulledVerdicts(pulled).map(({ verdict, count }) => (
                <span key={verdict} className="detail-pulled">
                  <b>{count}</b> {verdict}
                </span>
              )),
            )}
            ; S7 below names each one.
          </>
        )}
      </dd>
    </div>
  );
}

function PulledNode({ entry }: { entry: PulledEntry }) {
  const { model, dispatch } = useReport();
  const pkg = entry.packages[0];
  if (entry.vendor !== null || pkg === undefined) {
    return (
      <span className="detail-pulled">
        <b>{entry.packages.length}</b> <span className="mono">{entry.vendor}</span> packages, all{" "}
        {entry.verdict}
      </span>
    );
  }
  const inReport = model.report.findings.some((f) => f.package === pkg);
  return (
    <span className="detail-pulled">
      {inReport ? (
        <button
          type="button"
          className="detail-hop-link"
          title={`Open ${pkg}`}
          onClick={() => {
            dispatch({ type: "select", pkg });
          }}
        >
          {pkg}
        </button>
      ) : (
        <span className="mono">{pkg}</span>
      )}{" "}
      <span className="detail-pulled-verdict">({entry.verdict})</span>
    </span>
  );
}
