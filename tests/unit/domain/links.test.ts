import { describe, expect, test } from "vitest";
import { cveUrl, packagistUrl, repoHost, safeHref } from "../../../src/domain/links";
import type { PackageDetails } from "../../../src/model/types";

// safeHref's cases are ported verbatim (values unchanged) from tests/js/lib.test.js:33-73 — it is
// one of the two functions the legacy suite's own header calls "the boundary where a mistake stops
// being a rendering bug and becomes a vulnerability". packagistUrl/cveUrl/repoHost lived in
// report.js, not lib.js, and had no dedicated unit tests there (js-1.md §4); their cases below are
// new, derived from that spec's documented behaviour.

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
    // A percent-encoded "javascript:" is untested in the legacy suite (lib.md §2 "Not tested") and
    // the regex only inspects literal characters, so it passes when it otherwise matches — ported
    // here as a locked-in (if uncomfortable) parity fact, not an endorsement.
    expect(safeHref("https://example.test/%6A%61%76%61")).toBe("https://example.test/%6A%61%76%61");
  });
});

describe("packagistUrl", () => {
  const finding = { package: "vendor/pkg" };

  test("links a package whose lock explicitly came from a Composer repository", () => {
    const details = new Map<string, PackageDetails>([
      [
        "vendor/pkg",
        {
          metadata: null,
          activity: null,
          repositoryLink: null,
          lock: {
            php: null,
            released: null,
            repository: null,
            fromComposerRepository: true,
            dev: false,
            branchSnapshot: false,
            type: null,
          },
        },
      ],
    ]);
    expect(packagistUrl(finding, details)).toBe("https://packagist.org/packages/vendor/pkg");
  });

  test("assumes Packagist when the package is missing from details entirely (install-time document)", () => {
    expect(packagistUrl(finding, new Map())).toBe("https://packagist.org/packages/vendor/pkg");
  });

  test("assumes Packagist when the details entry has no lock at all", () => {
    const details = new Map<string, PackageDetails>([
      ["vendor/pkg", { metadata: null, activity: null, repositoryLink: null, lock: null }],
    ]);
    expect(packagistUrl(finding, details)).toBe("https://packagist.org/packages/vendor/pkg");
  });

  test("only an explicit fromComposerRepository:false suppresses the link", () => {
    const details = new Map<string, PackageDetails>([
      [
        "vendor/pkg",
        {
          metadata: null,
          activity: null,
          repositoryLink: null,
          lock: {
            php: null,
            released: null,
            repository: null,
            fromComposerRepository: false,
            dev: false,
            branchSnapshot: false,
            type: null,
          },
        },
      ],
    ]);
    expect(packagistUrl(finding, details)).toBeNull();
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

describe("repoHost", () => {
  test("returns the host of an absolute http(s) URL", () => {
    expect(repoHost("https://github.com/vendor/pkg")).toBe("github.com");
    expect(repoHost("http://example.test/path")).toBe("example.test");
  });

  test("strips a leading www.", () => {
    expect(repoHost("https://www.gitlab.com/vendor/pkg")).toBe("gitlab.com");
  });

  test("falls back to the literal 'repository' for null or a non-http(s) URL", () => {
    expect(repoHost(null)).toBe("repository");
    expect(repoHost("not-a-url")).toBe("repository");
    expect(repoHost("ftp://example.com/x")).toBe("repository");
  });
});
