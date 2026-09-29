import { describe, expect, test } from "vitest";
import { cveUrl, fromComposerRepository, registryLink, repoHost, safeHref } from "../../../src/domain/links";
import type { PackageDetails, PackageOrigin } from "../../../src/model/types";

// safeHref is where a mistake becomes a vulnerability rather than a rendering bug.

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

describe("fromComposerRepository", () => {
  const lockSaying = (fromComposerRepository: boolean | null): Map<string, PackageDetails> =>
    new Map([
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
            fromComposerRepository,
            dev: false,
            branchSnapshot: false,
            type: null,
          },
        },
      ],
    ]);
  const finding = (fromComposerRepository: boolean | null) => ({
    package: "vendor/pkg",
    fromComposerRepository,
  });

  test("the finding's own field wins over its lock entry's", () => {
    expect(fromComposerRepository(finding(true), lockSaying(false))).toBe(true);
    expect(fromComposerRepository(finding(false), lockSaying(true))).toBe(false);
  });

  test("falls back to the lock entry's from_composer_repository, the same fact, where the finding has none", () => {
    expect(fromComposerRepository(finding(null), lockSaying(true))).toBe(true);
    expect(fromComposerRepository(finding(null), lockSaying(false))).toBe(false);
    expect(fromComposerRepository(finding(null), lockSaying(null))).toBeNull();
  });

  test("assumes nothing where no field says: no details entry, or one without a lock", () => {
    expect(fromComposerRepository(finding(null), new Map())).toBeNull();
    const noLock = new Map<string, PackageDetails>([
      ["vendor/pkg", { metadata: null, activity: null, repositoryLink: null, lock: null }],
    ]);
    expect(fromComposerRepository(finding(null), noLock)).toBeNull();
  });
});

describe("registryLink", () => {
  const origin = (overrides: Partial<PackageOrigin>): { origin: PackageOrigin } => ({
    origin: { kind: "composer", registry: null, packageUrl: null, local: false, ...overrides },
  });

  test("links package_url as written, labelled by its registry", () => {
    expect(
      registryLink(
        origin({
          kind: "composer",
          registry: "wp-packages.org",
          packageUrl: "https://wp-packages.org/packages/wp-plugin/acme-forms",
        }),
      ),
    ).toEqual({
      href: "https://wp-packages.org/packages/wp-plugin/acme-forms",
      label: "wp-packages.org",
      title: "this package's page on wp-packages.org",
    });
  });

  test("never builds a link: a packagist entry without package_url has none", () => {
    expect(
      registryLink(origin({ kind: "packagist", registry: "packagist.org", packageUrl: null })),
    ).toBeNull();
  });

  test("a registry the page does not know is a label like any other", () => {
    expect(
      registryLink(
        origin({ registry: "registry.acme.example", packageUrl: "https://registry.acme.example/p/acme" }),
      )?.label,
    ).toBe("registry.acme.example");
  });

  test("a link with no registry named is labelled by its own host", () => {
    expect(registryLink(origin({ packageUrl: "https://www.example.test/p/acme" }))?.label).toBe(
      "example.test",
    );
  });

  test("no link where the document does not say where the package came from, or the URL is unsafe", () => {
    expect(registryLink({ origin: null })).toBeNull();
    expect(registryLink(origin({ registry: "packagist.org", packageUrl: "javascript:alert(1)" }))).toBeNull();
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
