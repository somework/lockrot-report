import { readFileSync } from "node:fs";

import { describe, expect, test, vi } from "vitest";

import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";

vi.mock("../../../src/schema", () => ({ READS_SCHEMAS: [3] }));

function withSchema(schema: number): ReturnType<typeof normalize> {
  const embed = assembleEmbed("composite");
  return normalize({ ...embed, report: { ...embed.report, lockrot: { ...embed.report.lockrot, schema } } });
}

function newerSchemaFor(schema: number): boolean {
  const result = withSchema(schema);
  if (!result.ok) throw new Error(result.error.message);
  return result.model.newerSchema;
}

describe("newerSchema follows READS_SCHEMAS", () => {
  test("the highest schema the page reads is not newer", () => {
    expect(newerSchemaFor(3)).toBe(false);
  });

  test("a schema above the highest one the page reads is newer", () => {
    expect(newerSchemaFor(4)).toBe(true);
  });
});

describe("a report-1 document stops before the report-2 model", () => {
  test("the one kept report-1 bundle gives the report-1 result with its lockrot version", () => {
    const bundle = JSON.parse(readFileSync("fixtures/bundles/mini.json", "utf8")) as {
      report: { lockrot: { version: string } };
    };

    const result = normalize(bundle);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "report-1", version: bundle.report.lockrot.version },
    });
  });

  test("schema 1 gives the report-1 result, whatever report-2 keys the document carries", () => {
    expect(withSchema(1)).toMatchObject({ ok: false, error: { kind: "report-1" } });
  });

  test("a document that states no schema is report-1", () => {
    const embed = assembleEmbed("composite");
    const { schema: _schema, ...lockrot } = embed.report.lockrot;

    expect(normalize({ ...embed, report: { ...embed.report, lockrot } })).toMatchObject({
      ok: false,
      error: { kind: "report-1" },
    });
  });
});
