import { describe, expect, test } from "vitest";

import { assembleEmbed, report2Cases, report2Pages } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";

describe("report2Cases", () => {
  test("is the composite and the offline cases", () => {
    const cases = report2Cases();

    expect(cases).toContain("composite");
    expect(cases.filter((name) => name !== "composite").length).toBeGreaterThan(0);
    expect(cases.filter((name) => name !== "composite").every((name) => name.includes("offline"))).toBe(true);
  });
});

describe("assembleEmbed", () => {
  test("puts the case's explain-2 lock and metadata under its package, with no repository link", () => {
    const embed = assembleEmbed("B-offline-dagger");

    expect(Object.keys(embed.details)).toEqual(embed.report.findings.map((finding) => finding.package));
    for (const entry of Object.values(embed.details)) {
      expect(Object.keys(entry).sort()).toEqual(["lock", "metadata", "repository_link"]);
      expect(entry.repository_link).toBeNull();
    }
  });

  test("has no details for a case without an explain-2 document", () => {
    expect(assembleEmbed("composite").details).toEqual({});
  });

  test("throws on a case the bundle does not hold", () => {
    expect(() => assembleEmbed("no-such-case")).toThrow(/no-such-case/);
  });
});

describe("report2Pages", () => {
  const pages = report2Pages();

  test("holds the two baselined embeds as recorded, beside the assembled cases", () => {
    const names = pages.map((page) => page.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "report2-composite",
        "report2-baselined-wallabag-2.6",
        "report2-baselined-wallabag-main",
      ]),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  test.each(pages)("$name is a report-2 embed the model reads", ({ embed }) => {
    const result = normalize(embed);

    expect(result.ok && result.model.report2).toEqual(embed);
  });
});
