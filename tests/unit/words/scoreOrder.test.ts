import { describe, expect, test } from "vitest";

import { sortFindings } from "../../../src/domain/scoreOrder";
import { multiFindingReports } from "./recorded";

describe("the order run.score_model.sort publishes", () => {
  test.each(multiFindingReports())("$name re-sorts to its rank", ({ report }) => {
    const reversed = [...report.findings].reverse();

    const sorted = sortFindings(reversed, report.run.score_model.sort);

    expect(sorted.map(({ package: name, rank }) => [name, rank])).toEqual(
      report.findings.map(({ package: name }, index) => [name, index + 1]),
    );
  });

  test("a path no finding holds takes the default of its key", () => {
    const sort = [
      {
        key: "security",
        path: "score.parts.security.contribution",
        dir: "desc",
        default: 0,
        collation: null,
      },
    ] as const;
    const withSecurity = { package: "a", score: { parts: { security: { contribution: 2 } } } };
    const without = { package: "b", score: { total: 0 } };

    expect(
      sortFindings([without, withSecurity] as never, sort as never).map(({ package: name }) => name),
    ).toEqual(["a", "b"]);
  });

  test("an unknown direction keeps the order it was given", () => {
    const sort = [{ key: "package", path: "package", dir: "sideways", default: null, collation: null }];
    const findings = [{ package: "b" }, { package: "a" }];

    expect(sortFindings(findings as never, sort as never).map(({ package: name }) => name)).toEqual([
      "b",
      "a",
    ]);
  });
});
