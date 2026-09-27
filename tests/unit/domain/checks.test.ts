import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  blockedByS10,
  checkName,
  checkStrip,
  checkTally,
  dataLabel,
  levelTone,
  pulledRows,
  s10ReasonWords,
  timestampParts,
  wrapParts,
} from "../../../src/domain/checks";
import { CHECK_NAMES } from "../../../src/domain/vocab";
import { SIGNAL_IDS } from "../../../src/model/types";
import type { Finding } from "../../../src/model/types";
import { normalize } from "../../../src/model/normalize";
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
    expect(strip.blockedReasons).toEqual([{ raw: "undated_releases", known: true }]);
    expect(strip.blockedUnknown).toEqual([]);
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
    expect(strip.blockedReasons).toEqual([]);
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

  it("counts quiet cells with no activity on file inside the quiet figure", () => {
    const finding = makeFinding({ signals: [makeSignal({ id: "S6", level: "warn" })] });
    expect(checkTally(checkStrip(finding), 2)).toEqual([
      "1 fired",
      "9 quiet (2 with no activity on file)",
      "every check ran",
    ]);
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

describe("S10's open vocabularies (0.13): a reason or a check id this page does not know", () => {
  function edgesFinding(pkg: string): Finding {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "fixtures", "bundles", "mini-0.13-edges.json"), "utf8"),
    ) as unknown;
    const result = normalize(raw);
    if (!result.ok) throw new Error("mini-0.13-edges failed to normalize");
    const finding = result.model.report.findings.find((f) => f.package === pkg);
    if (finding === undefined) throw new Error(`${pkg} is not in mini-0.13-edges`);
    return finding;
  }

  function withS10(data: Record<string, unknown>, others: Finding["signals"] = []): Finding {
    return makeFinding({ signals: [...others, makeSignal({ id: "S10", level: "info", data })] });
  }

  it("gives a blocked check only the reasons of the checks that name it (mini-0.13-edges acme/licensed)", () => {
    // S10 says sbom_lookup (quota_exhausted) stopped S99 and acme:licence, and release_dates
    // (undated_releases) stopped S2. Only S2 is a cell here, so only its reason is said beside it.
    const strip = checkStrip(edgesFinding("acme/licensed"));
    expect(strip.cells.filter((c) => c.state === "blocked").map((c) => c.id)).toEqual(["S2"]);
    expect(strip.blockedReasons).toEqual([{ raw: "undated_releases", known: true }]);
    // Both ids it does not know fired, so none of them is also "could not run".
    expect(strip.unknown).toEqual(["acme:licence", "S99"]);
    expect(strip.blockedUnknown).toEqual([]);
  });

  it("keeps a reason it does not know as written, never as one it knows", () => {
    const strip = checkStrip(
      withS10({
        unchecked: [{ check: "sbom_lookup", reason: "quota_exhausted", blocks: ["S2"] }],
        blocks: ["S2"],
      }),
    );
    expect(strip.blockedReasons).toEqual([{ raw: "quota_exhausted", known: false }]);
    expect(s10ReasonWords({ raw: "quota_exhausted", known: false })).toBe("quota_exhausted");
    expect(s10ReasonWords({ raw: "undated_releases", known: true })).toBe("undated releases");
  });

  it("knows exactly the reasons lockrot 0.11 to 0.13 write", () => {
    const known = [
      "no_token",
      "anonymous_budget",
      "install_time_budget",
      "rate_limit",
      "fetch_failed",
      "offline",
      "undated_releases",
    ];
    for (const reason of known) {
      const strip = checkStrip(
        withS10({
          unchecked: [{ check: "repository_activity", reason, blocks: ["S3", "S4"] }],
          blocks: ["S3", "S4"],
        }),
      );
      expect(strip.blockedReasons).toEqual([{ raw: reason, known: true }]);
    }
    for (const reason of ["undated_release", "quota_exhausted", "constructor", "toString"]) {
      const strip = checkStrip(
        withS10({ unchecked: [{ check: "x", reason, blocks: ["S2"] }], blocks: ["S2"] }),
      );
      expect(strip.blockedReasons).toEqual([{ raw: reason, known: false }]);
    }
  });

  it("lists an id it does not know that S10 stopped and that did not fire, with that check's reason", () => {
    const strip = checkStrip(
      withS10({
        unchecked: [
          { check: "sbom_lookup", reason: "quota_exhausted", blocks: ["acme:sbom"] },
          { check: "release_dates", reason: "undated_releases", blocks: ["S2"] },
        ],
        blocks: ["acme:sbom", "S2"],
      }),
    );
    expect(strip.blockedUnknown).toEqual(["acme:sbom"]);
    expect(strip.blockedReasons).toEqual([
      { raw: "quota_exhausted", known: false },
      { raw: "undated_releases", known: true },
    ]);
    // The tally counts the ten cells only; the id is said on the could-not-run line instead.
    expect(strip.counts.blocked).toBe(1);
  });

  it("says a reason once however many checks share it, and keeps one whose entry names no readable list", () => {
    const strip = checkStrip(
      withS10({
        unchecked: [
          { check: "repository_activity", reason: "rate_limit", blocks: ["S3"] },
          { check: "repository_activity", reason: "rate_limit", blocks: ["S4"] },
          { check: "sbom_lookup", reason: "quota_exhausted" },
        ],
        blocks: ["S3", "S4"],
      }),
    );
    expect(strip.blockedReasons).toEqual([
      { raw: "rate_limit", known: true },
      { raw: "quota_exhausted", known: false },
    ]);
  });

  it("gives no reason, and lists no id, when nothing S10 names stayed unfired", () => {
    const strip = checkStrip(
      withS10(
        { unchecked: [{ check: "x", reason: "quota_exhausted", blocks: ["acme:x"] }], blocks: ["acme:x"] },
        [makeSignal({ id: "acme:x", level: "warn" })],
      ),
    );
    expect(strip.blockedUnknown).toEqual([]);
    expect(strip.blockedReasons).toEqual([]);
    expect(strip.unknown).toEqual(["acme:x"]);
  });
});
