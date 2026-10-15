import { describe, expect, test } from "vitest";
import { cveUrl, safeHref } from "../../../src/domain/links";

describe("safeHref", () => {
  test("passes the links a report really carries (lib.test.js:33-43)", () => {
    for (const url of [
      "https://github.com/vendor/pkg",
      "http://example.test/advisory?id=1",
      "https://nvd.nist.gov/vuln/detail/CVE-2022-31090",
      "HTTPS://EXAMPLE.TEST/x",
    ]) {
      expect(safeHref(url)).toBe(url);
    }
    expect(safeHref("  https://example.test/x  ")).toBe("https://example.test/x");
  });

  test("refuses every scheme that could run or smuggle (lib.test.js:45-60)", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "ssh://git@github.com/vendor/pkg.git",
      "//evil.test/x",
      "/relative/path",
      "mailto:someone@example.test",
    ]) {
      expect(safeHref(url)).toBeNull();
    }
  });

  test("refuses a url that would break out of the attribute it lands in (lib.test.js:62-67)", () => {
    expect(safeHref('https://example.test/x" onmouseover="alert(1)')).toBeNull();
    expect(safeHref("https://example.test/x'>")).toBeNull();
    expect(safeHref("https://example.test/x<script>")).toBeNull();
    expect(safeHref("https://example.test/a b")).toBeNull();
  });

  test("takes nothing but a string (lib.test.js:69-73)", () => {
    for (const value of [null, undefined, 42, {}, ["https://example.test/"], true]) {
      expect(safeHref(value)).toBeNull();
    }
  });

  test("rejects an empty or whitespace-only string", () => {
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
  });

  test("does not decode percent-encoding before checking the scheme", () => {
    // The regex inspects literal characters only, so a percent-encoded scheme passes: pinned, not
    // endorsed.
    expect(safeHref("https://example.test/%6A%61%76%61")).toBe("https://example.test/%6A%61%76%61");
  });
});

describe("cveUrl", () => {
  test("links an advisory whose id is a CVE", () => {
    expect(cveUrl({ cve: "CVE-2022-31090" })).toBe("https://nvd.nist.gov/vuln/detail/CVE-2022-31090");
  });

  test("returns null for an advisory with no CVE id", () => {
    expect(cveUrl({ cve: null })).toBeNull();
  });

  test("returns null for a non-CVE identifier such as a GHSA id", () => {
    expect(cveUrl({ cve: "GHSA-xxxx-yyyy-zzzz" })).toBeNull();
  });

  test("the CVE- prefix check is case-sensitive, matching the legacy regex exactly", () => {
    expect(cveUrl({ cve: "cve-2022-31090" })).toBeNull();
  });
});
