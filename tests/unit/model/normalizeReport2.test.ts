import { describe, expect, test } from "vitest";

import { normalize } from "../../../src/model/normalize";
import { embeds, reportDocuments } from "./lockrotContract";

const documents = reportDocuments();
const recordedEmbeds = embeds();

describe("normalize keeps a report-2 document typed", () => {
  test.each(documents)("$name, bare, as model.report2 with no details", ({ document }) => {
    const result = normalize(document);

    expect(result.ok && result.model.report2).toEqual({ report: document, details: {} });
  });

  test.each(recordedEmbeds)("$name, the html embed, with its details", ({ embed }) => {
    const result = normalize(embed);

    expect(result.ok && result.model.report2).toEqual(embed);
  });

  test.each(documents.slice(0, 1))(
    "$name without a root key the schema requires is not report-2",
    ({ document }) => {
      const { gate: _gate, ...withoutGate } = document as Record<string, unknown>;

      const result = normalize(withoutGate);

      expect(result.ok && result.model.report2).toBeNull();
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
