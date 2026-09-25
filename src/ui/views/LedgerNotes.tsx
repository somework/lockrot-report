import type { ComponentChildren } from "preact";
import type { GroupCounts, RunFacts } from "../../domain/rows";
import type { AgeKind } from "../../domain/age";

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

/** "you require all three directly", "each comes in through another package", or both counted. */
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
      <Num n={direct} /> you require directly, <Num n={transitive} /> {transitive === 1 ? "comes" : "come"} in
      through another package
    </>
  );
}

function devPart(counts: GroupCounts): ComponentChildren {
  const { total, dev } = counts;
  if (dev === 0) return null;
  if (dev === total) return total === 1 ? ", for development only" : ", all for development only";
  return (
    <>
      ; <Num n={dev} /> {dev === 1 ? "is" : "are"} for development only
    </>
  );
}

/** "2 silent and 1 abandoned; you require all three directly." */
export function GroupSentence({ counts }: { counts: GroupCounts }) {
  const verdicts = counts.verdicts.map((v) => (
    <span key={v.verdict}>
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
      return "left behind on an older branch";
    case "old-promise":
      return "released before the target PHP";
    default:
      return facts.verdict;
  }
}

const AGE_LEAD: Readonly<Record<AgeKind, string>> = {
  branch: "their branch last released",
  release: "last released",
  push: "last pushed",
};

function yearsRange(min: number, max: number): string {
  const lo = min.toFixed(1);
  const hi = max.toFixed(1);
  return lo === hi ? lo : `${lo}–${hi}`;
}

/**
 * "These 14 hoa/* packages are all marked abandoned by their repository, last released 9.1–9.7
 * years ago, and all come in through wallabag/rulerz." Above a run of consecutive rows only; says
 * what the rows below share, so their repeated words can stay quiet.
 */
export function RunNote({ facts }: { facts: RunFacts }) {
  const who = facts.vendor !== null ? <span className="mono">{facts.vendor}/*</span> : null;
  const age = facts.age;
  return (
    <p className="frun-note">
      These <Num n={facts.count} /> {who}
      {who && " "}packages are all {runReason(facts)}
      {age && (
        <>
          , {AGE_LEAD[age.kind]} <span className="mono">{yearsRange(age.min, age.max)}</span> years ago
        </>
      )}
      {facts.via !== null ? (
        <>
          , and all come in through <b className="mono">{facts.via}</b>
          {facts.dev ? ", for development only" : ""}.
        </>
      ) : (
        <>, and you require each one directly{facts.dev ? " for development" : ""}.</>
      )}
    </p>
  );
}
