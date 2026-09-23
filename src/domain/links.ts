/**
 * URLs the page may put in an `href`, or `null` when it may not.
 *
 * `safeHref` is ported verbatim from legacy `lib.js` (lib.md §2); `packagistUrl`, `cveUrl` and
 * `repoHost` are ported from the pure helpers at the top of legacy `report.js` (js-1.md §4) that
 * had no dedicated unit tests of their own there.
 */

import type { Advisory, Finding, PackageDetails } from "../model/types";

/**
 * A URL the page may put in an href, or null. Ported verbatim from legacy `safeHref()`
 * (`lib.js:35-38`).
 *
 * The page renders data it did not produce: a package's own metadata (name, description,
 * repository), an advisory feed's `link` and title, and the document's own `$schema`. Any of these
 * arriving as a `javascript:` URL would run script in the page's own origin —
 * `target="_blank"` is not a defence, only luck. The scheme allowlist here is the actual control;
 * the character blocklist stops the same value breaking out of the double-quoted attribute it lands
 * in even when the scheme is fine.
 */
export function safeHref(url: unknown): string | null {
  const value = typeof url === "string" ? url.trim() : "";

  return /^https?:\/\/[^\s<>"']+$/i.test(value) ? value : null;
}

/**
 * The Packagist page for a finding's package, or `null` when the lock says it did not come from a
 * Composer repository. Ported from legacy `packagistUrl()` (`report.js:66-70`).
 *
 * Only an *explicit* `fromComposerRepository === false` suppresses the link — a package missing
 * from `details` entirely, or a details entry with no `lock` at all (an install-time document,
 * `DESIGN.md` §"Compatibility"), is assumed to have come from Packagist, same as the legacy page.
 */
export function packagistUrl(
  finding: Pick<Finding, "package">,
  details: ReadonlyMap<string, PackageDetails>,
): string | null {
  const entry = details.get(finding.package);
  const fromComposerRepository = entry?.lock ? entry.lock.fromComposerRepository : true;

  return fromComposerRepository ? `https://packagist.org/packages/${finding.package}` : null;
}

/**
 * The NVD page for an advisory that carries a CVE id, or `null` — a GHSA-only or vendor-only id has
 * nowhere to link. Ported from legacy `cveUrl()` (`report.js:100-102`). The `CVE-` prefix check is
 * case-sensitive, matching the legacy regex exactly (no `/i` flag).
 */
export function cveUrl(advisory: Pick<Advisory, "cve">): string | null {
  return advisory.cve && /^CVE-/.test(advisory.cve)
    ? `https://nvd.nist.gov/vuln/detail/${advisory.cve}`
    : null;
}

/**
 * A repository URL's host, with a leading `www.` stripped, or the literal string `"repository"`
 * when `url` is not an absolute http(s) URL. Ported from legacy `repoHost()` (`report.js:96-99`).
 */
export function repoHost(url: string | null): string {
  const match = /^https?:\/\/([^/]+)/.exec(url ?? "");
  const host = match?.[1];

  return host ? host.replace(/^www\./, "") : "repository";
}
