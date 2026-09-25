import { describe, expect, it } from "vitest";
import {
  blockedByS10,
  checkName,
  checkStrip,
  checkTally,
  dataLabel,
  levelTone,
  pulledRows,
  timestampParts,
  wrapParts,
} from "../../../src/domain/checks";
import { CHECK_NAMES } from "../../../src/domain/vocab";
import { SIGNAL_IDS } from "../../../src/model/types";
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

describe("dataLabel", () => {
  it("swaps underscores for spaces and changes nothing else", () => {
    expect(dataLabel("branch_last_release")).toBe("branch last release");
    expect(dataLabel("newest_php")).toBe("newest php");
    expect(dataLabel("blocks")).toBe("blocks");
    expect(dataLabel("")).toBe("");
  });
});

describe("timestampParts", () => {
  it("splits an ISO timestamp into its date and the rest, losing nothing", () => {
    expect(timestampParts("2022-03-17T08:00:35+00:00")).toEqual({
      date: "2022-03-17",
      time: "T08:00:35+00:00",
    });
    expect(timestampParts("2026-09-01T10:00:00Z")).toEqual({ date: "2026-09-01", time: "T10:00:00Z" });
    expect(timestampParts("2026-09-01T10:00:00.123+0530")).toEqual({
      date: "2026-09-01",
      time: "T10:00:00.123+0530",
    });
  });

  it("leaves a bare date, a version and free text alone", () => {
    expect(timestampParts("2022-03-17")).toBeNull();
    expect(timestampParts("11.5.0")).toBeNull();
    expect(timestampParts("released 2022-03-17T08:00:35+00:00")).toBeNull();
    expect(timestampParts("2022-03-17T08:00:35+00:00 later")).toBeNull();
  });
});

describe("CHECK_NAMES", () => {
  it("names every one of the ten checks in at most two words, S10 by its subject, not a verdict", () => {
    for (const id of SIGNAL_IDS) {
      const name = CHECK_NAMES[id];
      expect(name, id).toBeTruthy();
      expect(name?.split(" ").length, id).toBeLessThanOrEqual(2);
    }
    expect(CHECK_NAMES.S10).toBe("check gaps");
    expect(CHECK_NAMES.S1).toBe("abandoned");
  });
});

describe("checkName", () => {
  it("says a quiet S10 means every check ran, and names every other cell by CHECK_NAMES", () => {
    expect(checkName({ id: "S10", state: "quiet" })).toBe("all checks ran");
    expect(checkName({ id: "S10", state: "fired" })).toBe("check gaps");
    expect(checkName({ id: "S2", state: "blocked" })).toBe("release age");
    expect(checkName({ id: "S5", state: "quiet" })).toBe("predates PHP");
    expect(checkName({ id: "S9", state: "unreported" })).toBe("advisories");
  });
});

describe("wrapParts", () => {
  it("keeps a separator glued on with a no-break space inside the piece before it", () => {
    const parts = wrapParts("mautic/core-lib\u00a0› doctrine/dbal");
    expect(parts).toEqual([
      { text: "mautic/", atomic: true },
      { text: "core-lib\u00a0›", atomic: true },
      { text: " ", atomic: false },
      { text: "doctrine/", atomic: true },
      { text: "dbal", atomic: true },
    ]);
  });

  it("keeps a whole identifier as one piece in prose", () => {
    const parts = wrapParts("pulls in doctrine/annotations (abandoned)", { paths: false });
    expect(parts.filter((part) => part.atomic).map((part) => part.text)).toEqual(["doctrine/annotations"]);
    expect(parts.map((part) => part.text).join("")).toBe("pulls in doctrine/annotations (abandoned)");
  });

  const atoms = (text: string) =>
    wrapParts(text)
      .filter((p) => p.atomic)
      .map((p) => p.text);
  const joined = (text: string) =>
    wrapParts(text)
      .map((p) => p.text)
      .join("");

  it("leaves plain prose as one plain run", () => {
    expect(wrapParts("the age of the package was not read")).toEqual([
      { text: "the age of the package was not read", atomic: false },
    ]);
    expect(wrapParts("")).toEqual([{ text: "", atomic: false }]);
  });

  it("keeps a verdict, a date and an advisory id whole, punctuation with them", () => {
    expect(atoms("branch 10.x last released 2022-03-17 (4.5 years ago)")).toEqual(["2022-03-17"]);
    expect(atoms("gaufrette/extras (left-behind), next")).toEqual(["gaufrette/", "extras", "(left-behind),"]);
    expect(atoms("v10.0.3 (PKSA-kbc7-dq62-pt7d, PKSA-qv5y-crcz-9nxw);")).toEqual([
      "(PKSA-kbc7-dq62-pt7d,",
      "PKSA-qv5y-crcz-9nxw);",
    ]);
  });

  it("splits a package name and a URL only after a slash, never inside '//', and after '::'", () => {
    expect(atoms("composer/package-versions-deprecated")).toEqual([
      "composer/",
      "package-versions-deprecated",
    ]);
    expect(atoms("https://github.com/Spomky-Labs/otphp")).toEqual([
      "https://",
      "github.com/",
      "Spomky-Labs/",
      "otphp",
    ]);
    expect(atoms("Factory::loadFromProvisioningUri")).toEqual(["Factory::", "loadFromProvisioningUri"]);
    expect(atoms("trailing/")).toEqual(["trailing/"]);
  });

  it("changes no character: the parts joined are the text", () => {
    for (const text of [
      "pulls in 21 flagged packages: composer/package-versions-deprecated (abandoned), a/b and 16 more",
      "  leading and trailing  ",
      "a\u00a0› b/c-d",
      "https://x.io//double/slash",
    ]) {
      expect(joined(text)).toBe(text);
    }
  });
});

describe("pulledRows", () => {
  const OPEN = "mautic/core-lib";

  it("drops the open package's hop and the row's own, leaving what it comes in through", () => {
    const rows = pulledRows(
      [
        { package: "doctrine/cache", verdict: "abandoned", chain: [OPEN, "doctrine/dbal", "doctrine/cache"] },
        { package: "gaufrette/extras", verdict: "silent", chain: [OPEN, "gaufrette/extras"] },
      ],
      OPEN,
    );
    expect(rows).toEqual([
      { package: "doctrine/cache", verdict: "abandoned", via: ["doctrine/dbal"] },
      { package: "gaufrette/extras", verdict: "silent", via: [] },
    ]);
  });

  it("keeps a first hop that is not the open package", () => {
    const rows = pulledRows([{ package: "c/c", verdict: "stale", chain: ["a/a", "b/b", "c/c"] }], OPEN);
    expect(rows?.[0]?.via).toEqual(["a/a", "b/b"]);
  });

  it("returns null for any other shape, so the generic drawing shows every field", () => {
    expect(pulledRows([], OPEN)).toBeNull();
    expect(pulledRows("x", OPEN)).toBeNull();
    expect(pulledRows([{ package: "a/a", verdict: "stale", chain: "a/a" }], OPEN)).toBeNull();
    expect(pulledRows([{ package: "a/a", verdict: "stale", chain: [], extra: 1 }], OPEN)).toBeNull();
    expect(pulledRows([{ id: "S2" }], OPEN)).toBeNull();
  });
});
