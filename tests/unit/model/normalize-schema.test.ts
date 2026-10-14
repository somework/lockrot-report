import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import { normalize } from "../../../src/model/normalize";

vi.mock("../../../src/schema", () => ({ READS_SCHEMAS: [2] }));

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/bundles/empty-lockrot-self.json",
);

function newerSchemaFor(schema: number): boolean {
  const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as { report: { lockrot: { schema: number } } };
  raw.report.lockrot.schema = schema;
  const result = normalize(raw);
  if (!result.ok) throw new Error("normalize failed");
  return result.model.newerSchema;
}

describe("newerSchema follows READS_SCHEMAS", () => {
  test("the highest schema the page reads is not newer", () => {
    expect(newerSchemaFor(2)).toBe(false);
  });

  test("a schema above the highest one the page reads is newer", () => {
    expect(newerSchemaFor(3)).toBe(true);
  });
});
