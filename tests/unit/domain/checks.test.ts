import { describe, expect, it } from "vitest";
import { blockedByS10, checkStrip, checkTally, levelTone } from "../../../src/domain/checks";
import type { Finding } from "../../../src/model/types";
import { makeFinding, makeSignal } from "./fixtures";

function states(finding: Finding): string[] {
  return checkStrip(finding).cells.map((cell) => `${cell.id}:${cell.state}`);
}

/** wallabag's scheb/2fa-google-authenticator: S8 fired although S10 says S2 and S8 could not run. */
const SCHEB = makeFinding({
  verdict: "left-behind",
  signals: [
    makeSignal({ id: "S7", level: "info" }),
    makeSignal({ id: "S8", level: "warn" }),
    makeSignal({
      id: "S10",
      level: "info",
      data: {
        unchecked: [{ check: "release_dates", reason: "undated_releases", blocks: ["S2", "S8"] }],
        blocks: ["S2", "S8"],
      },
    }),
  ],
});

describe("checkStrip", () => {
  it("draws all ten checks in id order, fired or quiet, and says every check ran without S10", () => {
    const finding = makeFinding({
      signals: [
        makeSignal({ id: "S7", level: "info" }),
        makeSignal({ id: "S2", level: "warn" }),
        makeSignal({ id: "S1", level: "high" }),
      ],
    });
    const strip = checkStrip(finding);
    expect(states(finding)).toEqual([
      "S1:fired",
      "S2:fired",
      "S3:quiet",
      "S4:quiet",
      "S5:quiet",
      "S6:quiet",
      "S7:fired",
      "S8:quiet",
      "S9:quiet",
      "S10:quiet",
    ]);
    expect(strip.counts).toEqual({ fired: 3, quiet: 7, blocked: 0, unreported: 0 });
    expect(checkTally(strip)).toEqual(["3 fired", "7 quiet", "every check ran"]);
  });

  it("lists the fired signals high first, then warn, then the rest, ties in numeric id order", () => {
    const finding = makeFinding({
      signals: [
        makeSignal({ id: "S10", level: "info", data: { blocks: [] } }),
        makeSignal({ id: "S4", level: "warn" }),
        makeSignal({ id: "S3", level: "high" }),
        makeSignal({ id: "S2", level: "warn" }),
        makeSignal({ id: "S1", level: "high" }),
      ],
    });
    expect(checkStrip(finding).fired.map((s) => s.id)).toEqual(["S1", "S3", "S2", "S4", "S10"]);
  });

  it("marks a check S10 names as could-not-run only when its own signal did not fire (S10 state)", () => {
    const strip = checkStrip(SCHEB);
    expect(states(SCHEB)).toEqual([
      "S1:quiet",
      "S2:blocked",
      "S3:quiet",
      "S4:quiet",
      "S5:quiet",
      "S6:quiet",
      "S7:fired",
      "S8:fired",
      "S9:quiet",
      "S10:fired",
    ]);
    expect(strip.counts).toEqual({ fired: 3, quiet: 6, blocked: 1, unreported: 0 });
    expect(strip.blockedReason).toBe("undated releases");
    // S10 fired, so "every check ran" is never said, even beside a blocked count.
    expect(checkTally(strip)).toEqual(["3 fired", "6 quiet", "1 could not run"]);
  });

  it("says not reported, never quiet, when S10 fired without naming the checks it stopped", () => {
    const finding = makeFinding({
      signals: [makeSignal({ id: "S10", level: "info", data: { note: "something failed" } })],
    });
    const strip = checkStrip(finding);
    expect(strip.cells.filter((c) => c.state === "unreported").map((c) => c.id)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9",
    ]);
    expect(strip.blockedReason).toBeNull();
    expect(checkTally(strip)).toEqual(["1 fired", "9 not reported"]);
  });

  it("says nothing more than the counts when S10 fired but every check it names fired anyway", () => {
    const finding = makeFinding({
      signals: [
        makeSignal({ id: "S8", level: "warn" }),
        makeSignal({ id: "S10", level: "info", data: { blocks: ["S8"] } }),
      ],
    });
    expect(checkTally(checkStrip(finding))).toEqual(["2 fired", "8 quiet"]);
  });

  it("keeps a newer lockrot's check in the fired list, outside the ten cells", () => {
    const finding = makeFinding({
      signals: [makeSignal({ id: "S11", level: "high" }), makeSignal({ id: "S2", level: "warn" })],
    });
    const strip = checkStrip(finding);
    expect(strip.fired.map((s) => s.id)).toEqual(["S11", "S2"]);
    expect(strip.unknown).toEqual(["S11"]);
    expect(strip.cells).toHaveLength(10);
    expect(strip.counts.fired).toBe(1);
  });

  it("gives a finding with no signal ten quiet checks", () => {
    const strip = checkStrip(makeFinding({ signals: [] }));
    expect(strip.counts).toEqual({ fired: 0, quiet: 10, blocked: 0, unreported: 0 });
    expect(strip.fired).toEqual([]);
    expect(checkTally(strip)).toEqual(["0 fired", "10 quiet", "every check ran"]);
  });
});

describe("blockedByS10", () => {
  it("reads data.blocks first", () => {
    expect(blockedByS10(makeSignal({ id: "S10", data: { blocks: ["S4"] } }))).toEqual(["S4"]);
  });

  it("falls back to the union of data.unchecked[].blocks", () => {
    const s10 = makeSignal({
      id: "S10",
      data: {
        unchecked: [
          { check: "a", reason: "x", blocks: ["S2", "S8"] },
          { check: "b", reason: "y", blocks: ["S8", "S3"] },
        ],
      },
    });
    expect(blockedByS10(s10)).toEqual(["S2", "S8", "S3"]);
  });

  it("returns null when neither shape names a check, or one entry is malformed", () => {
    expect(blockedByS10(makeSignal({ id: "S10", data: {} }))).toBeNull();
    expect(blockedByS10(makeSignal({ id: "S10", data: { blocks: "S2" } }))).toBeNull();
    expect(
      blockedByS10(makeSignal({ id: "S10", data: { unchecked: [{ blocks: ["S2"] }, { reason: "x" }] } })),
    ).toBeNull();
  });
});

describe("levelTone", () => {
  it("draws high as crit, warn as med, anything else as low", () => {
    expect(levelTone("high")).toBe("crit");
    expect(levelTone("warn")).toBe("med");
    expect(levelTone("info")).toBe("low");
    expect(levelTone("urgent")).toBe("low");
  });
});
