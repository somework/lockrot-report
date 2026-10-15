import { describe, expect, test } from "vitest";

import {
  acceptedLine,
  depthSentence,
  flagBars,
  foldPeek2,
  gateState,
  gradeChips,
  leadFigure,
  leadScope,
  multiFlagLine,
  securityBlock,
} from "../../../src/domain/overviewBand";
import type { Report2 } from "../../../src/model/report2";
import { pageGoldens } from "../words/recorded";

function golden(id: string): Report2 {
  const found = pageGoldens().find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no page golden ${id}`);
  return structuredClone(found.report);
}

describe("the lead of the overview band", () => {
  test("states the flagged figure out of the packages checked, with the share of the lock", () => {
    expect(leadFigure(golden("composite"))).toEqual({
      kind: "flagged",
      figure: "7",
      of: "of 7 packages",
      flagged: "flagged",
      share: "· 100% of the lock",
    });
  });

  test("says nothing is flagged with one singular package word", () => {
    expect(leadFigure(golden("new-symfony"))).toEqual({
      kind: "clean",
      text: "Nothing flagged in 1 package",
    });
  });

  test("says an empty lock holds no package", () => {
    expect(leadFigure(golden("empty-lock"))).toEqual({ kind: "empty", text: "No packages in this lock" });
  });

  test("words the scope rollup from rot_depth", () => {
    expect(leadScope(golden("composite"))).toEqual([
      "all 7 in production",
      "6 required directly, 1 pulled in",
    ]);
  });

  test("gives one chip per graded verdict in run order, zero counts kept", () => {
    expect(gradeChips(golden("composite"))).toEqual([
      { grade: "critical", count: 3 },
      { grade: "high", count: 2 },
      { grade: "medium", count: 0 },
      { grade: "low", count: 2 },
    ]);
  });

  test("gives no chip for an empty lock", () => {
    expect(gradeChips(golden("empty-lock"))).toEqual([]);
  });
});

describe("the flag ledger", () => {
  test("draws one bar per carried flag in flag order, split by grade", () => {
    const bars = flagBars(golden("composite"));

    expect(bars.map(({ flag, carrying }) => `${flag} ${carrying}`)).toEqual([
      "abandoned 1",
      "pinned 1",
      "left-behind 1",
      "old-promise 3",
      "stale 2",
      "vulnerable 4",
    ]);
    expect(bars.find(({ flag }) => flag === "vulnerable")).toEqual({
      flag: "vulnerable",
      carrying: 4,
      parts: [
        { grade: "critical", count: 2 },
        { grade: "low", count: 2 },
      ],
      split: "graded critical 2 · low 2",
    });
  });

  test("follows run.score_model.flag_order, not the key order of root flags", () => {
    const report = golden("composite");
    report.run.score_model.flag_order = [
      "vulnerable",
      "stale",
      "old-promise",
      "left-behind",
      "pinned",
      "silent",
      "abandoned",
    ];

    expect(flagBars(report)[0]?.flag).toBe("vulnerable");
  });

  test("says how many packages carry more than one flag, with the score model", () => {
    expect(multiFlagLine(golden("composite"))).toBe("4 carry more than one flag · score model 1");
  });

  test("takes the singular for one package", () => {
    const report = { ...golden("composite"), packages_multi_flag: 1 };

    expect(multiFlagLine(report)).toBe("1 carries more than one flag · score model 1");
  });

  test("has no multi-flag line when nothing is flagged", () => {
    expect(multiFlagLine(golden("new-symfony"))).toBeNull();
  });
});

describe("the depth sentence", () => {
  test("names the unnamed share and the deepest package with its hops", () => {
    expect(depthSentence(golden("composite"))).toBe(
      "1 of 7 flagged packages is named by no line of composer.json; the deepest, symfony/polyfill-intl-idn, sits 1 hop from the nearest line.",
    );
  });

  test("lists three deepest names, then the rest as a count, with a plural verb", () => {
    const report = golden("composite");
    const deep = (name: string) => ({ package: name, chain: ["a/root", name] });
    report.rot_depth = {
      ...report.rot_depth,
      not_in_composer_json: 4,
      max_depth: 2,
      deepest: ["d/one", "d/two", "d/three", "d/four", "d/five"].map(deep),
    };

    expect(depthSentence(report)).toBe(
      "4 of 7 flagged packages are named by no line of composer.json; the deepest, d/one, d/two, d/three and 2 more, sit 2 hops from the nearest line.",
    );
  });

  test("leaves the second clause out when no package is deepest", () => {
    const report = golden("composite");
    report.rot_depth = { ...report.rot_depth, not_in_composer_json: 0, deepest: [] };

    expect(depthSentence(report)).toBe("0 of 7 flagged packages are named by no line of composer.json.");
  });

  test("says depth is unknown when the run read no composer.json", () => {
    const report = golden("composite");
    report.rot_depth = { ...report.rot_depth, unmeasured: { unreached: 0, no_composer_json: 1 } };

    expect(depthSentence(report)).toBe(
      "lockrot did not read composer.json, so it does not know how deep the 1 flagged package sits.",
    );
  });

  test("has no sentence when nothing is flagged", () => {
    expect(depthSentence(golden("new-symfony"))).toBeNull();
  });
});

describe("the accepted line", () => {
  test("says none when no graded finding carries an accepted flag", () => {
    expect(acceptedLine(golden("composite"))).toBe("Accepted by the allowlist: none in flagged packages");
  });

  test("counts each accepted flag in graded findings, in flag order", () => {
    const report = golden("composite");
    report.flags.stale = { ...report.flags.stale, accepted: { all: 3, in_graded: 2 } };
    report.flags.pinned = { ...report.flags.pinned, accepted: { all: 1, in_graded: 1 } };

    expect(acceptedLine(report)).toBe("Accepted by the allowlist in flagged packages: pinned 1, stale 2");
  });

  test("has no accepted line when nothing is flagged", () => {
    expect(acceptedLine(golden("new-symfony"))).toBeNull();
  });
});

describe("the Security block", () => {
  test("counts advisories by severity in model order and packages by fix in ease order", () => {
    expect(securityBlock(golden("composite"))).toEqual({
      figure: "20",
      unit: "advisories on 4 packages",
      note: null,
      severities: [
        { id: "critical", band: "critical", outlined: false, count: 1 },
        { id: "high", band: "high", outlined: false, count: 4 },
        { id: "medium", band: "medium", outlined: false, count: 4 },
        { id: "unrated", band: "medium", outlined: true, count: 2 },
        { id: "low", band: "low", outlined: false, count: 9 },
      ],
      fixes: [
        { label: "composer update", count: 2 },
        { label: "upgrade", count: 1 },
        { label: "php floor raise", count: 1 },
      ],
    });
  });

  test("says the list may be partial when the check was partial", () => {
    const report = golden("composite");
    report.security = { ...report.security, check: "partial" };

    expect(securityBlock(report).note).toBe("advisory check incomplete, so the list may be partial");
  });

  test("words a lock with no counted advisory", () => {
    const block = securityBlock(golden("new-symfony"));

    expect(block.figure).toBeNull();
    expect(block.unit).toBe("no security advisory");
    expect(block.severities).toEqual([]);
  });
});

describe("the phone fold", () => {
  test("peeks at the flags, the advisories and the libyears", () => {
    expect(foldPeek2(golden("composite"))).toEqual(["6 flags", "20 advisories", "17.9 libyears"]);
  });

  test("peeks at a clean lock with one singular word each", () => {
    expect(foldPeek2(golden("new-symfony"))).toEqual(["no flag", "no advisory", "0.0 libyears"]);
  });
});

describe("the gate line's state", () => {
  test("fails when the gate fails", () => {
    expect(gateState(golden("composite"))).toBe("fails");
  });

  test("passes when a gate applies and nothing fails it", () => {
    const report = golden("composite");
    report.gate = { ...report.gate, fails: false };

    expect(gateState(report)).toBe("passes");
  });

  test("is off when the run sets no gate value, strict network or not", () => {
    const report = golden("composite");
    report.gate = { ...report.gate, fails: false };
    report.run = { ...report.run, gates: [], strict_network: true };

    expect(gateState(report)).toBe("off");
  });

  test("is not applied under --generate-baseline when nothing fails", () => {
    const report = golden("composite");
    report.gate = { ...report.gate, fails: false };
    report.run = { ...report.run, mode: "generate_baseline" };

    expect(gateState(report)).toBe("not_applied");
  });

  test("fails under --generate-baseline when the gate fails", () => {
    const report = golden("composite");
    report.run = { ...report.run, mode: "generate_baseline" };

    expect(gateState(report)).toBe("fails");
  });
});
