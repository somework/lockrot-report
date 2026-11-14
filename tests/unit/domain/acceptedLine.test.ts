import { describe, expect, test } from "vitest";

import { acceptedLine } from "../../../src/domain/overviewBand";
import type { Report2 } from "../../../src/model/report";
import { pageGoldens } from "../words/recorded";

const composite = (): Report2 => {
  const found = pageGoldens().find(({ id }) => id === "composite");
  if (found === undefined) throw new Error("no composite page golden");
  return structuredClone(found.report);
};

type MaintenanceFlag = Exclude<keyof Report2["flags"], "vulnerable">;

const accept = (report: Report2, flag: MaintenanceFlag, inGraded: number): void => {
  const entry = report.flags[flag];
  entry.accepted = { ...entry.accepted, in_graded: inGraded };
};

describe("the Flags block's accepted line (SPEC §7.9.4)", () => {
  test("says none in flagged packages when no flag has an accepted count", () => {
    expect(acceptedLine(composite())).toBe("Accepted by the allowlist: none in flagged packages");
  });

  test("lists each flag with its count above 0, in run.flag_ids order", () => {
    const report = composite();
    report.run = {
      ...report.run,
      flag_ids: ["stale", "abandoned", "pinned", "left-behind", "old-promise", "silent", "vulnerable"],
    };
    accept(report, "abandoned", 2);
    accept(report, "stale", 1);

    expect(acceptedLine(report)).toBe("Accepted by the allowlist: stale 1, abandoned 2");
  });

  test("shows no line when nothing is flagged", () => {
    expect(acceptedLine({ ...composite(), packages_flagged: 0 })).toBeNull();
  });
});
