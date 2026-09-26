import type { ComponentChildren } from "preact";
import { day, plural } from "../../domain/format";
import { agePhrase, type TimelineLane, type TimelineModel } from "../../domain/timeline";
import type { Tone } from "../../domain/vocab";
import { toneClass } from "../common/common";
import { useReport } from "../context";
import { LONG_CONSTRAINT, type TopWord } from "./TimelineRows";

/**
 * The two answer sentences (PD-TIMELINE-7). Every number is a date lockrot wrote or the time
 * between it and `now`. `tone` is the reader's release age against the run's thresholds; `null`
 * leaves the age in ink — always for a snapshot, whose date says when a branch was checked out,
 * not how old a release is, so a fresh-green "7 weeks" there would vouch for something unreleased.
 */
export function Answer({
  timeline,
  installedVersion,
  tone,
  topWord,
}: {
  timeline: TimelineModel;
  installedVersion: string;
  tone: Tone | null;
  topWord: TopWord;
}) {
  const { now } = useReport();
  const { mine, top, releasesOnly } = timeline;
  const noun = releasesOnly ? "release" : "branch";
  const nouns = releasesOnly ? "releases" : "branches";
  const age = (lane: TimelineLane) => (
    <b className={tone === null ? "detail-timeline-age" : `detail-timeline-age is-toned ${toneClass(tone)}`}>
      {agePhrase(lane.date, now)}
    </b>
  );
  const name = (text: string) => <b className="detail-timeline-name">{text}</b>;
  const topFacts = (
    <>
      <b className="mono detail-timeline-go">{top.branch}</b>,{" "}
      {top.showLabel ? (
        <>
          released <span className="mono">{top.label}</span> on{" "}
        </>
      ) : (
        "released on "
      )}
      <span className="nowrap">{day(top.date)}</span>{" "}
      <span className="nowrap">({agePhrase(top.date, now)} ago)</span>
      {top.php !== null && (
        <>
          {" "}
          and requires php{" "}
          <span className={top.php.length > LONG_CONSTRAINT ? "mono" : "mono nowrap"}>{top.php}</span>
        </>
      )}
      .
    </>
  );

  let lead: ComponentChildren;
  let sub: ComponentChildren;
  if (mine?.snapshot) {
    lead = (
      <>
        You’re on {name(mine.branch)}, a branch snapshot, not a release, dated {age(mine)} ago.
      </>
    );
    sub = (
      <>
        The {topWord} release {noun} is {topFacts}
      </>
    );
  } else if (mine === null) {
    lead = (
      <>
        You’re on {name(installedVersion)}; none of these {nouns} is marked as yours.
      </>
    );
    sub = (
      <>
        The {topWord} {noun} is {topFacts}
      </>
    );
  } else if (timeline.newerCount === 0) {
    const others = timeline.lanes.length - 1;
    const nothing =
      topWord === "newest" ? "Nothing newer has been released" : "No higher version has been released";
    lead = (
      <>
        You’re on the {topWord} {noun}, {name(mine.branch)}.{" "}
        {releasesOnly ? <>It came out {age(mine)} ago.</> : <>Its last release was {age(mine)} ago.</>}
      </>
    );
    sub =
      others === 1 ? (
        <>
          {nothing}; the only other {noun}, <span className="mono">{timeline.lanes[1]?.branch}</span>, is
          older.
        </>
      ) : (
        <>
          {nothing}; the other {plural(others, noun, nouns)} are older.
        </>
      );
  } else {
    // The subject is named: a newer branch exists, so "its last release" alone would read as the
    // package's — the age the answer at the top quotes, which is that newer branch's (an evaluator
    // read the two serif sentences, 9.1 and 9.7 years, as a contradiction).
    lead = (
      <>
        Your branch, {name(mine.branch)}, had its last release {age(mine)} ago.
      </>
    );
    sub =
      timeline.newerCount === 1 ? (
        <>
          There is <b>1 newer {noun}</b>: {topFacts}
        </>
      ) : (
        <>
          There are <b>{plural(timeline.newerCount, `newer ${noun}`, `newer ${nouns}`)}</b>. The {topWord} is{" "}
          {topFacts}
        </>
      );
  }

  return (
    <>
      <p className="detail-timeline-answer">{lead}</p>
      <p className="detail-timeline-sub">{sub}</p>
    </>
  );
}

/** One line, only for the marks a reader cannot read off the table itself: their own marker (a
 *  ring, or a diamond for a snapshot — one shape in every case, never an age colour), the first
 *  row's, and the line. The threshold guides are captioned on the axis ("3y", "5y",
 *  `GuideCaptions`); the key only says, once and without a number, what those captions count. */
export function Key({
  timeline,
  topWord,
  guides,
}: {
  timeline: TimelineModel;
  topWord: TopWord;
  guides: boolean;
}) {
  const mine = timeline.mine;
  return (
    <p className="detail-timeline-key">
      {mine !== null && (
        <span className="detail-timeline-key-item">
          <span
            className={
              mine.snapshot ? "detail-timeline-swatch is-snapshot" : "detail-timeline-swatch is-mine"
            }
            aria-hidden="true"
          />
          you
        </span>
      )}
      {timeline.top.newest && (
        <span className="detail-timeline-key-item">
          <span className="detail-timeline-swatch is-newest" aria-hidden="true" />
          {topWord}
        </span>
      )}
      <span className="detail-timeline-key-item">
        <span className="detail-timeline-swatch-line" aria-hidden="true" />
        time since its last release
      </span>
      {guides && (
        <span className="detail-timeline-key-item">
          <span className="detail-timeline-swatch-guide" aria-hidden="true" />
          age limit, in years ago
        </span>
      )}
    </p>
  );
}
