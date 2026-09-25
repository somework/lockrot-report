import type { ComponentChildren } from "preact";
import type { GroupCounts, RunFacts } from "../../domain/rows";

/**
 * The two sentences the Findings list reads out loud (PD-ROWS-6, DESIGN.md §5), in the serif the
 * summary band and the release-branches answer already use for an answer. Every number in them is
 * a count over the rows directly below; every name is a field those rows already show. Never a
 * bare list of package names — the reader reads a sentence, then the rows it describes.
 */

const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function Num({ n }: { n: number }) {
  return <b>{n}</b>;
}

/** "a, b and c" with each item already a node. */
function joinAnd(items: readonly ComponentChildren[]): ComponentChildren[] {
  return items.flatMap((item, i) => {
    if (i === 0) return [item];
    return [i === items.length - 1 ? " and " : ", ", item];
  });
}

/**
 * "you require all three directly" or "each comes in through another package" when the group is
 * alike; counted in the filter rail's own two words — "13 direct, 25 transitive" — when it is mixed,
 * so a long group's sentence stays near one line instead of running to five (a judge's must-fix).
 */
function reachPart(counts: GroupCounts): ComponentChildren {
  const { total, direct } = counts;
  const transitive = total - direct;
  if (direct === total) {
    if (total === 1) return "you require it directly";
    if (total === 2) return "you require both directly";
    return `you require all ${SMALL[total] ?? total} directly`;
  }
  if (direct === 0) {
    return total === 1 ? "it comes in through another package" : "each comes in through another package";
  }
  return (
    <>
      <Num n={direct} /> direct, <Num n={transitive} /> transitive
    </>
  );
}

function devPart(counts: GroupCounts): ComponentChildren {
  const { total, dev } = counts;
  if (dev === 0) return null;
  if (dev === total) return total === 1 ? ", for development only" : ", all for development only";
  return (
    <>
      ,{" "}
      <span className="fl-unit">
        <Num n={dev} /> dev-only
      </span>
    </>
  );
}

/** "2 silent and 1 abandoned; you require all three directly." or "19 abandoned, 9 left-behind,
 *  6 silent, 3 pinned and 1 old-promise; 13 direct, 25 transitive, 1 dev-only." Each count and its
 *  word are one unbreakable unit, so a hyphenated verdict never splits at its hyphen ("old-/promise"). */
export function GroupSentence({ counts }: { counts: GroupCounts }) {
  const verdicts = counts.verdicts.map((v) => (
    <span key={v.verdict} className="fl-unit">
      <Num n={v.count} /> {v.verdict}
    </span>
  ));
  return (
    <p className="fgroup-sentence">
      {joinAnd(verdicts)}; {reachPart(counts)}
      {devPart(counts)}.
    </p>
  );
}

/** What every member of a run is, in words — the verdict's own reading, never a new judgement. */
function runReason(facts: RunFacts): string {
  switch (facts.verdict) {
    case "abandoned":
      return facts.abandonedBy === "S1"
        ? "marked abandoned by their repository"
        : facts.abandonedBy === "S3"
          ? "archived upstream"
          : "abandoned";
    case "pinned":
      return "pinned to a branch snapshot";
    case "left-behind":
      return "left behind on older branches";
    case "old-promise":
      return "released before the target PHP";
    default:
      return facts.verdict;
  }
}

function yearsRange(min: number, max: number): string {
  const lo = min.toFixed(1);
  const hi = max.toFixed(1);
  return lo === hi ? lo : `${lo}–${hi}`;
}

/**
 * How old the run is, carried on as the same sentence's second verb ("… and were last released
 * 9.1–9.7 years ago") rather than tacked on after a comma. A left-behind run's own reason already
 * names the branches, so their age reads straight on from it ("left behind on older branches last
 * released 3.7–10.3 years ago").
 */
function agePart(facts: RunFacts): ComponentChildren {
  const age = facts.age;
  if (age === null) return null;
  const years = <span className="mono">{yearsRange(age.min, age.max)}</span>;
  if (age.kind === "branch") {
    return facts.verdict === "left-behind" ? (
      <> last released {years} years ago</>
    ) : (
      <> and their installed branches were last released {years} years ago</>
    );
  }
  return (
    <>
      {" "}
      and were last {age.kind === "push" ? "pushed" : "released"} {years} years ago
    </>
  );
}

/**
 * "These 14 hoa/* packages are all marked abandoned by their repository and were last released
 * 9.1–9.7 years ago. All come in through wallabag/rulerz." Above a run of consecutive rows only;
 * says what the rows below share, so their repeated words can stay quiet. Two sentences, never a
 * comma splice: what they are and how old, then how they get in.
 */
export function RunNote({ facts }: { facts: RunFacts }) {
  const who = facts.vendor !== null ? <span className="mono">{facts.vendor}/*</span> : null;
  return (
    <p className="frun-note">
      These <Num n={facts.count} /> {who}
      {who && " "}packages are all {runReason(facts)}
      {agePart(facts)}.{" "}
      {facts.via !== null ? (
        <>
          All come in through <b className="mono">{facts.via}</b>
          {facts.dev ? ", for development only" : ""}.
        </>
      ) : (
        <>You require each one directly{facts.dev ? ", for development only" : ""}.</>
      )}
    </p>
  );
}
