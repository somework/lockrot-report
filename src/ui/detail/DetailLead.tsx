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
import { ageText, fixed, yearsAgo } from "../../domain/format";
import { waysIn } from "../../domain/reach";
import { timelineModel, type TimelineModel } from "../../domain/timeline";
import { Muted, OutLink, toneClass } from "../common/common";
import { PkgMention } from "../common/PkgMention";
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
      // A package the lock lists opens (PD-PROSE-1); a branch, a version or a constraint stays words.
      return <PkgMention name={part.text} className="detail-answer-name" />;
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

interface Fact {
  readonly label: string;
  readonly value: ComponentChildren;
  /** A quieter line under the value, for when the value alone would read wrong: an age that is not
   *  the reader's own branch's, or a 0.0 libyears that only means nothing newer came out. */
  readonly note?: ComponentChildren;
  readonly wide?: boolean;
}

/** The fact a document did not carry, said in the same muted words wherever it happens. */
const NOT_RECORDED = <Muted>not recorded</Muted>;

/**
 * Four facts, always the same four in the same places: a gap is said ("not recorded", "not
 * measured") rather than left out, so a reader comparing two packages never finds a column gone.
 */
function Facts({ finding, details }: { finding: Finding; details: PackageDetails | null }) {
  const { model, now } = useReport();
  const lock = details?.lock ?? null;
  const timeline = timelineModel(details?.metadata?.branches ?? [], lock, finding.version, now);
  const libyears = fixed(finding.libyears, 1);
  const facts: readonly Fact[] = [
    { label: "Installed", value: finding.version, wide: finding.version.length > 16 },
    ageFactCell(
      finding,
      details?.metadata?.installedRelease ?? lock?.released ?? null,
      details?.metadata?.installedRelease ? (details.metadata.installedReleaseDatedBy ?? null) : null,
    ),
    {
      label: "Libyears",
      value: libyears ?? <Muted>not measured</Muted>,
      // 0.0 is how far behind the newest release you are, not how healthy the package is.
      note: finding.libyears === 0 ? "nothing newer" : undefined,
    },
    { label: "PHP", value: lock?.php ? lock.php : NOT_RECORDED, wide: (lock?.php?.length ?? 0) > 14 },
  ];

  return (
    <div className="detail-facts-frame">
      <dl className="detail-facts">
        {facts.map((fact) => (
          <div key={fact.label} className={fact.wide ? "detail-fact is-wide" : "detail-fact"}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
            {fact.note !== undefined && <dd className="detail-fact-note">{fact.note}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );

  /** The age the Findings row draws for this package (`age.ts#ageFact`, S8 > S2 > S4) — the same age
   *  the answer sentence quotes — in its zone's tone unless the verdict does not rest on age. The
   *  slot keeps one short label, "Last release", in every case a release is what it dates, so a
   *  reader comparing packages scans one column; whose release it is (your branch's, or a newer
   *  branch's) goes in the note under the value. Only a push age, which is not a release at all, is
   *  labelled for what it is. With no such signal it falls back to the installed release's own date
   *  (the explain metadata's, then the lock's), and failing that says why: lockrot could not read
   *  it, or the document has none. */
  function ageFactCell(f: Finding, released: string | null, datedBy: string | null): Fact {
    const fact = ageFact(f, model.report.run.thresholds);
    if (fact !== null) {
      const tone = fact.contextOnly ? null : ageZone(fact.years, fact.warn, fact.high);
      const value = (
        <span className={tone === null ? undefined : `detail-fact-toned ${toneClass(tone)}`}>
          {yearsAgo(fact.years)}
        </span>
      );
      if (fact.kind === "push") return { label: "Last push", value };
      if (fact.kind === "branch") return { label: LAST_RELEASE, value, note: onYourBranch(timeline) };
      return { label: LAST_RELEASE, value, note: newerThanYours(timeline) ?? undefined };
    }
    // A snapshot's lock date is when a branch was checked out, not a release (the release-branches
    // answer draws the same distinction), so the slot says there is none and dates the snapshot.
    const snapshot = f.verdict === "pinned" || f.signals.some((s) => s.id === "S6");
    const dated = released ? ageText(released, now) : null;
    if (snapshot) {
      return {
        label: LAST_RELEASE,
        value: <Muted>none, a snapshot</Muted>,
        note: dated !== null && dated !== "undated" ? `dated ${dated}` : undefined,
      };
    }
    // The installed version's own date is not the package's last release (a newer one may exist that
    // this document did not read), so it keeps its own label and says whose it is.
    // A split package's installed version is dated by the monorepo's tag of it; the note says whose.
    if (dated !== null) {
      const note =
        datedBy !== null ? (
          <>
            your version, dated by <span className="mono">{datedBy}</span>
          </>
        ) : (
          "your version"
        );
      return { label: "Released", value: dated, note };
    }
    return { label: LAST_RELEASE, value: ageNotRead(f) ? <Muted>not read</Muted> : NOT_RECORDED };
  }
}

/** The one label the second fact carries whenever it dates a release (or says there is none). */
const LAST_RELEASE = "Last release";

/** S8's age is the reader's own branch's last release; the note names the branch. */
function onYourBranch(timeline: TimelineModel | null): ComponentChildren {
  const mine = timeline?.mine ?? null;
  if (mine === null || mine.snapshot) return "on your branch";
  return (
    <>
      on your <span className="mono">{mine.branch}</span>
    </>
  );
}

/**
 * When the package's newest release is on a newer branch than the reader's, the S2 age is that
 * branch's, not theirs — the release-branches answer further down quotes their own branch's age,
 * which is older. The note says whose release it is so the two numbers do not read as a
 * contradiction (an evaluator found three different ages on one screen with nothing between them).
 */
function newerThanYours(timeline: TimelineModel | null): ComponentChildren | null {
  const mine = timeline?.mine ?? null;
  if (timeline === null || mine === null || mine.snapshot || timeline.newerCount === 0) return null;
  if (!timeline.topReleasedLast) return <>on a newer branch than {mine.branch}</>;
  return (
    <>
      on <span className="mono">{timeline.top.branch}</span>, newer than yours
    </>
  );
}

/**
 * `composer.json › first hop › … › this package`. A hop that is itself a finding in this report is a
 * button that opens it, through the same `select` every row sends, so the hash and focus follow the
 * rules they already follow. `finding.chain` already ends with the package (Model's own comment);
 * a direct finding's chain is just itself.
 */
function Chain({ finding }: { finding: Finding }) {
  const { model } = useReport();
  const hops = finding.chain.length > 0 ? finding.chain : [finding.package];
  const flagged = new Set(model.report.findings.map((f) => f.package));
  // The same ways in the answer sentence and the ladder's reach rung count (`reach.ts#waysIn`).
  const others = waysIn(finding).filter((pkg) => pkg !== hops[0]);
  const also = hops.length > 1 ? "Also required through" : "Required through";

  return (
    <>
      <span className="detail-chain">
        {/* Each hop carries the "›" after it, and the last one its "· require-dev", as one unit: a
            line breaks only after a separator, never before one or before the dev note alone. */}
        {["composer.json", ...hops].map((pkg, index) => {
          const last = index === hops.length;
          return (
            <span key={`${index}-${pkg}`} className="detail-chain-step">
              {index === 0 ? (
                <span className="detail-hop is-root">{pkg}</span>
              ) : (
                <Hop pkg={pkg} self={pkg === finding.package} flagged={flagged.has(pkg)} />
              )}
              {!last && (
                <span className="detail-hop-sep" aria-hidden="true">
                  ›
                </span>
              )}
              {last && finding.dev && <span className="detail-hop-note">require-dev</span>}
            </span>
          );
        })}
      </span>
      {others.length > 0 && (
        <span className="detail-chain-also">
          {also}{" "}
          {others.length === 1 ? (
            <PkgMention name={others[0] ?? ""} className="mono" />
          ) : (
            `${others.length} other requirements of yours`
          )}
          .
        </span>
      )}
    </>
  );
}

/** One hop of the chain: the open package in ink, a hop that is itself a finding here a button
 *  that opens it (the same `select` every row sends), any other in mono. */
function Hop({ pkg, self, flagged }: { pkg: string; self: boolean; flagged: boolean }) {
  const { dispatch } = useReport();
  if (self) return <span className="detail-hop is-self">{pkg}</span>;
  if (!flagged) return <span className="detail-hop">{pkg}</span>;
  return (
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
  );
}

/** The most entries "What it pulls in" names one by one; past it, the line counts them by verdict
 *  instead, since a longer run of names is the bare package list a reader cannot take in — and a
 *  fold under the count names every one, by verdict, so the count is never a dead end. */
const PULLS_IN_NAMED = 4;

/** "a, b and c" with each item already a node. */
function joinAnd(items: readonly ComponentChildren[]): ComponentChildren[] {
  return items.flatMap((item, i) => (i === 0 ? [item] : [i === items.length - 1 ? " and " : ", ", item]));
}

function PullsIn({ finding }: { finding: Finding }) {
  const pulled = pulledIn(finding);
  if (pulled === null) return null;

  const named = pulled.entries.length <= PULLS_IN_NAMED;
  const byVerdict = pulledVerdicts(pulled);
  const total = byVerdict.reduce((sum, { packages }) => sum + packages.length, 0);
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
              byVerdict.map(({ verdict, packages }) => (
                <span key={verdict} className="detail-pulled is-count">
                  <b>{packages.length}</b> {verdict}
                </span>
              )),
            )}
            .
            <details className="detail-pulls-all">
              <summary>Name all {total}</summary>
              <dl className="detail-pulls-list">
                {byVerdict.map(({ verdict, packages }) => (
                  <div key={verdict} className="detail-pulls-group">
                    <dt>
                      {verdict} <span className="detail-pulls-n">{packages.length}</span>
                    </dt>
                    <dd>
                      {packages.map((pkg, index) => (
                        <Fragment key={pkg}>
                          {/* The comma rides with its name, so a line never starts on one. */}
                          <span className="detail-pulls-item">
                            <PackageName pkg={pkg} />
                            {index < packages.length - 2 ? "," : ""}
                          </span>
                          {index === packages.length - 2 ? " and " : index < packages.length - 1 ? " " : ""}
                        </Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        )}
      </dd>
    </div>
  );
}

/** A package name that opens its own finding when it is one here, through the same `select` every
 *  row sends; plain mono otherwise. */
function PackageName({ pkg }: { pkg: string }) {
  const { model, dispatch } = useReport();
  if (!model.report.findings.some((f) => f.package === pkg)) return <span className="mono">{pkg}</span>;
  return (
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
  );
}

function PulledNode({ entry }: { entry: PulledEntry }) {
  const pkg = entry.packages[0];
  if (entry.vendor !== null || pkg === undefined) {
    return (
      <span className="detail-pulled">
        <b>{entry.packages.length}</b> <span className="mono">{entry.vendor}</span> packages, all{" "}
        {entry.verdict}
      </span>
    );
  }
  return (
    <span className="detail-pulled">
      <PackageName pkg={pkg} /> <span className="detail-pulled-verdict">({entry.verdict})</span>
    </span>
  );
}
