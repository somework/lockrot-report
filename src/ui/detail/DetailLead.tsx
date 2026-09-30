import { Fragment } from "preact";
import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Finding, PackageDetails } from "../../model/types";
import { ageFact, ageNotRead, ageZone } from "../../domain/age";
import {
  answerParts,
  pulledIn,
  pulledVerdicts,
  type AnswerPart,
  type PulledEntry,
} from "../../domain/answer";
import { ageText, fixed, gapPhrase, yearsAgo } from "../../domain/format";
import {
  leadSaysTag,
  pinnedFacts,
  pinnedReleaseSlot,
  pinnedTagDetail,
  snapshotOf,
  tagNote,
  type DatedPoint,
  type PinnedFacts,
  type PinnedSlot,
  type TagDetail,
} from "../../domain/pinned";
import { MOVE_STEPS } from "../../domain/floors";
import { waysIn } from "../../domain/reach";
import { timelineModel, type TimelineModel } from "../../domain/timeline";
import { Muted, OutLink, toneClass } from "../common/common";
import { DisclosureButton, DisclosurePanel, useDisclosure } from "../common/Disclosure";
import { PkgMention } from "../common/PkgMention";
import { useReport } from "../context";
import { linesOf, useFitSteps } from "../useFit";
import "./detail-lead.css";

/** The top of the open package (PD-DETAIL-6): the answer sentence, four key facts, how it gets in
 *  and what flagged packages it pulls in. Nothing here is a recommendation. */
export function DetailLead({ finding, details }: { finding: Finding; details: PackageDetails | null }) {
  const { model } = useReport();
  const parts = answerParts({
    finding,
    metadataReplacement: details?.metadata?.replacement ?? null,
    thresholds: model.report.run.thresholds,
    details,
  });
  const pinned = finding.verdict === "pinned" ? pinnedFacts(finding, details) : null;
  const tagDetail = pinned === null ? null : pinnedTagDetail(pinned);
  const tagsId = `${useId()}-tags`;
  const disclosure = useDisclosure(TAGS_KEY);
  const answerRef = useFitSteps<HTMLParagraphElement>(MOVE_STEPS, noLineOverBare);
  const tags: TagsControl | null =
    tagDetail === null
      ? null
      : { id: tagsId, open: disclosure.open, toggle: disclosure.toggle, printed: disclosure.printed };

  return (
    <div className="detail-lead">
      <p ref={answerRef} className="detail-answer">
        {parts.map((part, index) => (
          <AnswerNode key={index} part={part} tags={tags} />
        ))}
      </p>
      {tagDetail !== null && (
        <DisclosurePanel
          id={tagsId}
          open={disclosure.open}
          className="detail-tags"
          labelledBy={disclosure.printed ? undefined : `${tagsId}-btn`}
        >
          <TagDetailWords detail={tagDetail} />
        </DisclosurePanel>
      )}
      <Facts finding={finding} details={details} pinned={pinned} />
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

/** S8's clause keeps its fullest words that take the lead no more lines than its barest. */
function noLineOverBare(answer: HTMLElement): boolean {
  if (answer.querySelector(".detail-answer-drop") === null) return true;
  const at = answer.dataset["fit"];
  const now = linesOf(answer);
  answer.dataset["fit"] = "bare";
  const bare = linesOf(answer);
  if (at === undefined) delete answer.dataset["fit"];
  else answer.dataset["fit"] = at;
  return now <= bare;
}

/** One key for every package: j/k keeps the reader's choice from one detail to the next. */
const TAGS_KEY = "pinned-tags";

interface TagsControl {
  readonly id: string;
  readonly open: boolean;
  readonly toggle: () => void;
  readonly printed: boolean;
}

/** A button is one unbreakable box, so only the version is the button when there is one: the words
 *  before it wrap with the sentence, and the whole phrase stays its name. */
function TagsNode({ part, tags }: { part: Extract<AnswerPart, { kind: "tags" }>; tags: TagsControl | null }) {
  const version = part.version === null ? null : <span className="detail-answer-tag">{part.version}</span>;
  if (tags === null || tags.printed) {
    return (
      <>
        {part.lead}
        {version}
      </>
    );
  }
  return (
    <>
      {version !== null && part.lead}
      <DisclosureButton
        id={`${tags.id}-btn`}
        label={version ?? part.lead}
        name={version === null ? undefined : part.text}
        open={tags.open}
        controls={tags.id}
        onToggle={tags.toggle}
        className="detail-answer-tags"
      />
    </>
  );
}

function AnswerNode({ part, tags }: { part: AnswerPart; tags: TagsControl | null }) {
  switch (part.kind) {
    case "tags":
      return <TagsNode part={part} tags={tags} />;
    case "text":
      return <>{part.text}</>;
    case "name":
      // A package the lock lists opens (PD-PROSE-1); a branch, a version or a constraint stays words.
      return <PkgMention name={part.text} className="detail-answer-name" />;
    case "code":
      return <code className="detail-answer-code">{part.text}</code>;
    case "phrase":
      return <span className="nowrap">{part.text}</span>;
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
    case "drop":
      return (
        <span className={`detail-answer-drop is-${part.step}`}>
          {part.parts.map((inner, index) => (
            <AnswerNode key={index} part={inner} tags={tags} />
          ))}
        </span>
      );
    case "replacement":
      return part.href !== null ? (
        <b className="detail-answer-replacement">
          <OutLink href={part.href}>{part.text}</OutLink>
        </b>
      ) : (
        <b className="detail-answer-replacement">{part.text}</b>
      );
  }
}

interface Fact {
  readonly label: string;
  readonly value: ComponentChildren;
  /**
   * For when the value alone would read wrong: an age that is not your branch's, or a 0.0 libyears.
   */
  readonly note?: ComponentChildren;
  readonly wide?: boolean;
}

/** The fact a document did not carry, said in the same muted words wherever it happens. */
const NOT_RECORDED = <Muted>not recorded</Muted>;

/**
 * Always the same four: a gap is said, never left out, so no column goes missing between packages.
 */
function Facts({
  finding,
  details,
  pinned,
}: {
  finding: Finding;
  details: PackageDetails | null;
  /** The pinned verdict's facts, whose answer may already word the tag. */
  pinned: PinnedFacts | null;
}) {
  const { model, now } = useReport();
  const lock = details?.lock ?? null;
  const timeline = timelineModel(
    details?.metadata?.branches ?? [],
    snapshotOf(finding, details),
    finding.version,
    now,
  );
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

  /** "Last release" whenever the slot dates a release, so packages compare in one column; a push
   *  and a snapshot's commit are not releases, so they get their own labels. */
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
    const pinned = pinnedFacts(f, details);
    const slot = pinned === null ? null : pinnedReleaseSlot(pinned);
    if (slot !== null) return pinnedCell(slot);

    // The installed version's date is not the package's last release: a newer one may exist.
    const dated = released ? ageText(released, now) : null;
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

  function pinnedCell(slot: PinnedSlot): Fact {
    const commit = slot.commit === null ? null : ageText(slot.commit, now);
    const commitAge = commit !== null && commit !== "undated" ? commit : null;
    if (slot.label === "snapshot") {
      return { label: "Snapshot", value: commitAge ?? NOT_RECORDED, note: snapshotNote() };
    }
    return {
      label: LAST_RELEASE,
      value: <Muted>{slot.words}</Muted>,
      note: commitAge !== null ? `commit dated ${commitAge}` : undefined,
    };
  }

  /** The answer that words the tag leaves the note out; a document that says nothing of tags keeps
   *  what the label cannot say alone. */
  function snapshotNote(): string | undefined {
    const facts = pinned ?? pinnedFacts(finding, details);
    if (facts === null) return SNAPSHOT_NOTE;
    if (pinned !== null && leadSaysTag(pinned)) return undefined;
    return tagNote(facts, now) ?? SNAPSHOT_NOTE;
  }
}

const SNAPSHOT_NOTE = "a branch commit, not a release";

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

/** The S2 age is then a newer branch's, older than the one the release-branches answer quotes; the
 *  note says whose, so the two do not read as a contradiction. */
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

/** A hop that is a finding here opens it through the same `select` every row sends. */
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
        {/* A hop and its "›" (the last its "require-dev") are one unit: a line breaks only
           after a separator. */}
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

/** Past this many, the line counts by verdict and a fold names every one. */
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

function Point({ point }: { point: DatedPoint }) {
  return (
    <span className="detail-tags-point">
      <span className="detail-tags-role">{point.role}</span>{" "}
      <span className="detail-tags-version">{point.version ?? ""}</span>{" "}
      <span className="detail-tags-day">
        {point.day}
        {point.role === "snapshot" && <span className="detail-tags-yours"> · yours</span>}
      </span>
    </span>
  );
}

/** Level 1 of the answer's tag words: the two dates oldest first, the gap on the rule between them,
 *  then what lockrot counts as a tag. */
function TagDetailWords({ detail }: { detail: TagDetail }) {
  const [first, second] = detail.points;
  const tag = detail.points.find((p) => p.role === "tag");
  return (
    <>
      <p className="detail-tags-dates">
        <Point point={first} />
        <span className="detail-tags-gap"> {gapPhrase(detail.years)} later </span>
        <Point point={second} />
      </p>
      <p className="detail-tags-note">
        {detail.datedBy !== null && (
          <>
            {tag?.version ?? "The tag"} is dated by <span className="mono">{detail.datedBy}</span>.{" "}
          </>
        )}
        A tag here can be a pre-release: lockrot counts those as tags.
      </p>
    </>
  );
}
