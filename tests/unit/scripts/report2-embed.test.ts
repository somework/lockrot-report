import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { assembleEmbed, isCorpusSlice, report2Cases, report2Pages } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";

describe("report2Cases", () => {
  test("is every report-2 document of the bundle", () => {
    const onDisk = readdirSync(join(process.cwd(), ".lockrot/tests/fixtures/contract/report-2"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length))
      .sort();

    expect(report2Cases()).toEqual(onDisk);
    expect(report2Cases()).toEqual(
      expect.arrayContaining([
        "A",
        "B",
        "F",
        "G",
        "B-baselined-dagger",
        "B-accepted-dagger",
        "D-partial-dagger",
      ]),
    );
  });
});

describe("isCorpusSlice", () => {
  test("holds the composite, the offline cases and the baselined embeds only", () => {
    expect(["composite", "B-offline-dagger", "baselined-wallabag-main"].every(isCorpusSlice)).toBe(true);
    expect(["B", "B-baselined-dagger", "D-partial-dagger"].some(isCorpusSlice)).toBe(false);
  });

  test("selects the composite, the offline cases and both baselined embeds from the pages", () => {
    const slice = report2Pages()
      .map((page) => page.name.slice("report2-".length))
      .filter(isCorpusSlice);

    const cases = report2Cases();
    const expected = [
      "composite",
      ...cases.filter((name) => name.includes("offline")),
      "baselined-wallabag-2.6",
      "baselined-wallabag-main",
    ];

    expect(slice.sort()).toEqual(expected.sort());
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
