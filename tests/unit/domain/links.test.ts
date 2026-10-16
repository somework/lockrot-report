import { describe, expect, test } from "vitest";
import { cveUrl, headerLinks, safeHref } from "../../../src/domain/links";
import type { Finding } from "../../../src/model/report";

const REPO = "https://github.com/symfony/monolog-bridge";
const REGISTRY = "https://packagist.org/packages/symfony/monolog-bridge";

function finding(
  origin: Partial<Finding["origin"]> = {},
  archived: boolean | null = false,
): Pick<Finding, "origin" | "activity"> {
  return {
    origin: { kind: "packagist", registry: "packagist.org", package_url: REGISTRY, local: false, ...origin },
    activity: { archived } as Finding["activity"],
  };
}

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

describe("headerLinks", () => {
  test("links the repository by its host, then the registry by its name, each to the URL as published", () => {
    expect(headerLinks(finding(), REPO)).toEqual([
      { href: REPO, text: "github.com ↗", name: "github.com repository, opens in a new tab" },
      {
        href: REGISTRY,
        text: "packagist.org ↗",
        name: "packagist.org page of this package, opens in a new tab",
      },
    ]);
  });

  test("writes the host without www., its port or its user", () => {
    const hosts = ["https://www.gitlab.com/a/b", "https://user@git.example.test:8443/a/b"].map(
      (url) => headerLinks(finding({ package_url: null }), url)[0]?.text,
    );

    expect(hosts).toEqual(["gitlab.com ↗", "git.example.test ↗"]);
  });

  test("names the host the browser goes to, whatever a backslash or a user part pretends", () => {
    const [repo] = headerLinks(finding({ package_url: null }), "https://evil.test\\@github.com/a/b");

    expect(repo?.text).toBe("evil.test ↗");
  });

  test("marks an archived repository with a word", () => {
    const [repo] = headerLinks(finding({}, true), REPO);

    expect(repo).toMatchObject({
      text: "github.com ↗ (archived)",
      name: "github.com repository (archived), opens in a new tab",
    });
  });

  test("adds no mark when the archived flag is false or was not read", () => {
    for (const archived of [false, null]) {
      expect(headerLinks(finding({}, archived), REPO)[0]?.text).toBe("github.com ↗");
    }
  });

  test("calls an unnamed registry the registry page", () => {
    const [registry] = headerLinks(finding({ registry: null }), null);

    expect(registry).toEqual({
      href: REGISTRY,
      text: "registry page ↗",
      name: "registry page of this package, opens in a new tab",
    });
  });

  test("leaves out a link whose URL is null", () => {
    expect(headerLinks(finding({ package_url: null }), null)).toEqual([]);
    expect(headerLinks(finding(), null).map(({ href }) => href)).toEqual([REGISTRY]);
  });

  test("leaves out a link whose URL safeHref refuses", () => {
    expect(
      headerLinks(finding({ package_url: "javascript:alert(1)" }), "ssh://git@github.com/a/b.git"),
    ).toEqual([]);
  });

  test("leaves out a repository URL that safeHref passes and the browser cannot parse", () => {
    expect(headerLinks(finding({ package_url: null }), "https://[github.com/a/b")).toEqual([]);
  });
});
