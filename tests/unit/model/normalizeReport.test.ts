import { describe, expect, test } from "vitest";

import { normalize, parseBundle } from "../../../src/model/normalize";
import { embeds, reportDocuments } from "./lockrotContract";

const documents = reportDocuments();
const recordedEmbeds = embeds();

function embedOf(result: ReturnType<typeof normalize>): unknown {
  return result.ok ? { report: result.model.report, details: result.model.details } : result.error;
}

describe("normalize keeps a report-2 document typed", () => {
  test("the fetched bundle holds report-2 documents and html embeds", () => {
    expect(documents.length).toBeGreaterThan(0);
    expect(recordedEmbeds.length).toBeGreaterThan(0);
  });

  test.each(documents)("$name, bare, as the model's report with no details", ({ document }) => {
    expect(embedOf(normalize(document))).toEqual({ report: document, details: {} });
  });

  test.each(recordedEmbeds)("$name, the html embed, with its details", ({ embed }) => {
    expect(embedOf(normalize(embed))).toEqual(embed);
  });

  test.each(documents.slice(0, 1))(
    "$name without root keys the schema requires fails visibly, naming them",
    ({ document }) => {
      const { gate: _gate, rot_depth: _depth, ...withoutTwo } = document as Record<string, unknown>;

      const result = normalize(withoutTwo);

      expect(result).toEqual({
        ok: false,
        error: {
          kind: "malformed-report",
          message: "This report-2 document leaves out keys lockrot always writes: gate, rot_depth.",
        },
      });
    },
  );

  test.each(documents.slice(0, 1))(
    "$name as an html embed without a root key fails the same way",
    ({ document }) => {
      const { findings: _findings, ...withoutFindings } = document as Record<string, unknown>;

      const result = normalize({ report: withoutFindings, details: {} });

      expect(result.ok ? null : result.error.kind).toBe("malformed-report");
    },
  );

  test.each(documents.slice(0, 1))(
    "$name naming a newer schema is read as report-2 and marked newer",
    ({ document }) => {
      const report = document as { lockrot: Record<string, unknown> };

      const result = normalize({ ...report, lockrot: { ...report.lockrot, schema: 3 } });

      expect(result.ok && result.model.newerSchema).toBe(true);
    },
  );
});

describe("inputs that are not a report", () => {
  test.each([
    ["null", null],
    ["an array", []],
    ["a bare string", "x"],
    ["a report that is not an object", { report: 5 }],
    ["an object with neither a report nor lockrot and findings", { lockrot: {} }],
  ])("%s is not-a-report", (_label, input) => {
    const result = normalize(input);

    expect(result.ok ? null : result.error.kind).toBe("not-a-report");
  });

  test("text that is not JSON is not-json", () => {
    const result = parseBundle("{not json");

    expect(result.ok ? null : result.error.kind).toBe("not-json");
  });

  test.each(documents.slice(0, 1))(
    "$name with an unparsable generated_at is not-a-report",
    ({ document }) => {
      const result = normalize({ ...(document as Record<string, unknown>), generated_at: "not a date" });

      expect(result.ok ? null : result.error.kind).toBe("not-a-report");
    },
  );
});

describe("details shapes (critic.md K1)", () => {
  test.each([
    ["[]", []],
    ["null", null],
    ["a string", "x"],
  ])("details as %s reads as no details", (_label, details) => {
    const report = documents[0]?.document;

    const result = normalize({ report, details });

    expect(result.ok && result.model.details).toEqual({});
  });

  test("a missing details key reads as no details", () => {
    const report = documents[0]?.document;

    const result = normalize({ report });

    expect(result.ok && result.model.details).toEqual({});
  });
});
