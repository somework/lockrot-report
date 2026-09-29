import type { ComponentChildren } from "preact";
import { pinnedRunReason } from "../../domain/pinned";
import type { GroupCounts, RunFacts } from "../../domain/rows";

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

/** Counted in the rail's two words when the group is mixed, so a long group's sentence stays near
 *  one line. */
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

/**
 * Each count and its word are one unbreakable unit, so "old-promise" never splits at its hyphen.
 */
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
      return pinnedRunReason(facts.pinned);
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

/** The same sentence's second verb, not tacked on after a comma. */
function agePart(facts: RunFacts): ComponentChildren {
  const age = facts.age;
  if (age === null) return null;
  const years = <span className="mono">{yearsRange(age.min, age.max)}</span>;
  if (age.kind === "branch") {
    return facts.verdict === "left-behind" ? (
      <> and were last released {years} years ago</>
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

/** Above a run of rows only, saying what they share so their repeated words can stay quiet. */
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
