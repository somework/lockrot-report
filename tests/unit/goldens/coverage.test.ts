import { describe, expect, it } from "vitest";
import { recordedCases } from "./cases";

const cases = recordedCases();

/** SPEC §7.9.14: the goldens hold one case per move kind, per opening and per score-0 word. */
describe("the recorded cases the goldens are written from", () => {
  it("hold every move kind of SPEC §7.9.13", () => {
    const kinds = new Set(cases.flatMap((c) => c.finding.next_step?.kind ?? []));

    expect([...kinds].sort()).toEqual(
      [
        "blocked",
        "find-alternative",
        "no-fix",
        "no-move",
        "no-single-fix",
        "no-tag",
        "raise-php",
        "replace",
        "require",
        "tag",
        "test",
        "update",
      ].sort(),
    );
  });

  it("hold every opening", () => {
    const openings = new Set(
      cases.flatMap((c) => ("decided_by" in c.finding.score ? c.finding.score.decided_by : [])),
    );

    expect([...openings].sort()).toEqual(["combination", "either", "maintenance", "security"]);
  });

  it("hold every score-0 word", () => {
    const words = new Set(cases.flatMap((c) => ("decided_by" in c.finding.score ? [] : c.finding.verdict)));

    expect([...words].sort()).toEqual(["finished", "ok", "unknown"]);
  });

  it("hold every no-move reason but two, which findingAnswer.test.ts covers", () => {
    const reasons = new Set(
      cases.flatMap((c) =>
        c.finding.next_step?.kind === "no-move" ? (c.finding.next_step.reason ?? []) : [],
      ),
    );

    expect([...reasons].sort()).toEqual(
      [
        "affected_range_unknown",
        "local_package",
        "metadata_not_read",
        "package_quiet",
        "releases_unknown",
      ].sort(),
    );
  });
});
