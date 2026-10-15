import { describe, expect, it } from "vitest";
import { liveExample } from "../../../src/domain/scorePanel";
import type { Report2 } from "../../../src/model/report";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;
/** One package checked, none flagged. */
const nothingFlagged = readContractJson("report-2", "stale-accepted-dagger.json") as Report2;

const firstByRank = () =>
  composite.findings
    .filter((f) => composite.run.graded_verdicts.includes(f.verdict as never))
    .reduce((a, b) => (b.rank < a.rank ? b : a));

describe("liveExample (SPEC §7.9.12, the live example)", () => {
  it("shows the score of the finding the reader opened", () => {
    const opened = composite.findings.find((f) => f.rank !== firstByRank().rank);
    if (!opened) throw new Error("the composite has more than one finding");

    const example = liveExample(composite, opened.package);

    expect(example.finding).toBe(opened);
    expect(example.text).toBe(
      `The finding you opened: ${opened.package} ${opened.version} scores ${opened.score.total}, ${opened.verdict}.`,
    );
  });

  it.each([
    ["no finding opened", null],
    ["a package the report does not hold", "acme/gone"],
  ])("shows the first finding by rank with %s", (_, pkg) => {
    const first = firstByRank();

    const example = liveExample(composite, pkg);

    expect(example.finding).toBe(first);
    expect(example.text).toBe(
      `The first finding by rank: ${first.package} ${first.version} scores ${first.score.total}, ${first.verdict}.`,
    );
  });

  it.each([
    ["no package opened", null],
    ["its score-0 package opened", nothingFlagged.findings[0]?.package ?? "missing"],
  ])("says that nothing is flagged when the report grades no finding, with %s", (_, pkg) => {
    expect(nothingFlagged.packages_flagged).toBe(0);
    expect(nothingFlagged.findings).toHaveLength(1);

    expect(liveExample(nothingFlagged, pkg)).toEqual({
      finding: null,
      text: "No package is flagged in this report.",
    });
  });
});
