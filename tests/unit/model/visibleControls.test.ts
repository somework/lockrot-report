import { describe, expect, test } from "vitest";

import { normalize } from "../../../src/model/normalize";
import type { Report2 } from "../../../src/model/report";
import { visibleControls } from "../../../src/model/visibleControls";
import { reportDocuments } from "./lockrotContract";

describe("visibleControls writes a character that reorders or hides text as a visible escape", () => {
  test.each([
    ["a right-to-left override and its pop", "dev-main‮0.0.1 ‬", "dev-main\\u{202E}0.0.1 \\u{202C}"],
    ["an isolate pair", "⁧acme⁩", "\\u{2067}acme\\u{2069}"],
    ["the marks", "1‎2‏3؜", "1\\u{200E}2\\u{200F}3\\u{61C}"],
    ["a zero-width space and joiner", "acme/​foo‍", "acme/\\u{200B}foo\\u{200D}"],
    ["a byte-order mark and a soft hyphen", "﻿v1­", "\\u{FEFF}v1\\u{AD}"],
    ["a tag character outside the BMP", "x\u{E0041}", "x\\u{E0041}"],
  ])("%s", (_label, text, shown) => {
    expect(visibleControls(text)).toBe(shown);
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
    finding.version = "dev-main‮0.0.1 ‬";
    finding.package = "acme/‮evil";
    return report;
  };

  test("in a value and in a details key, so a name still finds its details", () => {
    const report = crafted();

    const result = normalize({ report, details: { "acme/‮evil": { lock: null } } });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.model.report.findings[0]?.version).toBe("dev-main\\u{202E}0.0.1 \\u{202C}");
    expect(result.model.report.findings[0]?.package).toBe("acme/\\u{202E}evil");
    expect(Object.keys(result.model.details)).toEqual(["acme/\\u{202E}evil"]);
  });

  test("leaves the input document as it was", () => {
    const report = crafted();

    normalize(report);

    expect(report.findings[0]?.version).toBe("dev-main‮0.0.1 ‬");
  });
});
