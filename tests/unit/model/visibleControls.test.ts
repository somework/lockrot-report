import { describe, expect, test } from "vitest";

import { normalize } from "../../../src/model/normalize";
import type { Report2 } from "../../../src/model/report";
import { visibleControls } from "../../../src/model/visibleControls";
import { reportDocuments } from "./lockrotContract";

describe("visibleControls writes a character that reorders or hides text as a visible escape", () => {
  test.each([
    [
      "a right-to-left override and its pop",
      "dev-main\u202E0.0.1 \u202C",
      "dev-main\\u{202E}0.0.1 \\u{202C}",
    ],
    ["an isolate pair", "\u2067acme\u2069", "\\u{2067}acme\\u{2069}"],
    ["the marks", "1\u200E2\u200F3\u061C", "1\\u{200E}2\\u{200F}3\\u{061C}"],
    ["a zero-width space and joiner", "acme/\u200Bfoo\u200D", "acme/\\u{200B}foo\\u{200D}"],
    ["a byte-order mark and a soft hyphen", "\uFEFFv1\u00AD", "\\u{FEFF}v1\\u{00AD}"],
    ["a tag character outside the BMP", "x\u{E0041}", "x\\u{E0041}"],
  ])("%s", (_label, text, shown) => {
    expect(visibleControls(text)).toBe(shown);
  });

  test.each([
    [
      "every bidi control",
      "\u061C\u200E\u200F\u202A\u202B\u202C\u202D\u2066\u2067\u2068\u2069",
      "\\u{061C}\\u{200E}\\u{200F}\\u{202A}\\u{202B}\\u{202C}\\u{202D}\\u{2066}\\u{2067}\\u{2068}\\u{2069}",
    ],
    ["a soft hyphen", "a\u00ADb", "a\\u{00AD}b"],
  ])("writes %s as lockrot's text formats print it", (_label, text, lockrotForm) => {
    // lockrot's form is sprintf('\\u{%04X}'), held by lockrot's TerminalTextTest with these pairs.
    expect(visibleControls(text)).toBe(lockrotForm);
  });

  test("keeps letters of every script, accents and symbols as they are", () => {
    const text = "naïve ✓ шрифт עברית العربية 漢字 v1.0.0-β";

    expect(visibleControls(text)).toBe(text);
  });
});

describe("normalize shows the controls in every string of the document", () => {
  const crafted = () => {
    const report = structuredClone(reportDocuments()[0]?.document) as Report2;
    const finding = report.findings[0];
    if (finding === undefined) throw new Error("the first recorded document has a finding");
    finding.version = "dev-main\u202E0.0.1 \u202C";
    finding.package = "acme/\u202Eevil";
    return report;
  };

  test("in a value and in a details key, so a name still finds its details", () => {
    const report = crafted();

    const result = normalize({ report, details: { "acme/\u202Eevil": { lock: null } } });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.model.report.findings[0]?.version).toBe("dev-main\\u{202E}0.0.1 \\u{202C}");
    expect(result.model.report.findings[0]?.package).toBe("acme/\\u{202E}evil");
    expect(Object.keys(result.model.details)).toEqual(["acme/\\u{202E}evil"]);
  });

  test("leaves the input document as it was", () => {
    const report = crafted();

    normalize(report);

    expect(report.findings[0]?.version).toBe("dev-main\u202E0.0.1 \u202C");
  });
});

describe("normalize shows the controls in the version a report-1 screen names", () => {
  test("escapes a bidi control in lockrot.version of a report-1 document", () => {
    const result = normalize({ lockrot: { schema: 1, version: "0.13.0‮" }, findings: [] });

    expect(result.ok ? null : result.error).toEqual({
      kind: "report-1",
      message: "This is a report-1 document, and this page reads report-2 only.",
      version: "0.13.0\\u{202E}",
    });
  });
});
