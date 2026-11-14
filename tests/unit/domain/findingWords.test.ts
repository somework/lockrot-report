import { expect, it } from "vitest";

import { checksSkippedBody, namesCapped } from "../../../src/domain/findingWords";
import { qualifiers } from "../../../src/domain/qualifierRows";
import type { Finding } from "../../../src/model/report";
import { pageGoldens } from "../words/recorded";

it("names three names, then how many more", () => {
  expect(namesCapped(["a", "b", "c"])).toBe("a, b, c");
  expect(namesCapped(["a", "b", "c", "d", "e"])).toBe("a, b, c and 2 more");
});

const threeSkipped = (): { finding: Finding; run: Parameters<typeof qualifiers>[1] } => {
  const { report } = structuredClone(pageGoldens()[0] ?? { report: undefined });
  const finding = report?.findings[0];
  if (report === undefined || finding === undefined) throw new Error("no recorded finding");
  finding.checks_skipped = ["repository_activity", "advisories", "repository_archived"].map((check) => ({
    check,
    reason: "offline",
    blocks: [],
  }));
  return { finding, run: report.run };
};

it("lists three skipped checks of one reason as a list, as the qualifier rows do", () => {
  const { finding, run } = threeSkipped();
  const body = checksSkippedBody(finding, {});
  expect(body).toMatch(/^[^,]+, [^,]+ and [^,]+ \(/);
  expect(body).not.toMatch(/ and .* and /);
  const notRun = qualifiers(finding, run).notRun[0] ?? "";
  expect(body?.toLowerCase()).toBe(notRun.toLowerCase());
});
