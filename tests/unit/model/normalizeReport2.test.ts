import { describe, expect, test } from "vitest";

import { normalize } from "../../../src/model/normalize";
import { embeds, reportDocuments } from "./lockrotContract";

const documents = reportDocuments();
const recordedEmbeds = embeds();

describe("normalize keeps a report-2 document typed", () => {
  test("the fetched bundle holds report-2 documents and html embeds", () => {
    expect(documents.length).toBeGreaterThan(0);
    expect(recordedEmbeds.length).toBeGreaterThan(0);
  });

  test.each(documents)("$name, bare, as model.report2 with no details", ({ document }) => {
    const result = normalize(document);

    expect(result.ok && result.model.report2).toEqual({ report: document, details: {} });
  });

  test.each(recordedEmbeds)("$name, the html embed, with its details", ({ embed }) => {
    const result = normalize(embed);

    expect(result.ok && result.model.report2).toEqual(embed);
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

  test.each(documents.slice(0, 1))("$name naming another schema is not report-2", ({ document }) => {
    const report = document as { lockrot: Record<string, unknown> };

    const result = normalize({ ...report, lockrot: { ...report.lockrot, schema: 3 } });

    expect(result.ok && result.model.report2).toBeNull();
  });

  test.each(documents)("$name leaves out no key the page checks for", ({ document }) => {
    const result = normalize(document);

    expect(result.ok && result.model.report.absent).toEqual([]);
  });
});
