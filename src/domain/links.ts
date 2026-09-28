/** URLs the page may put in an `href`, or `null` when it may not. */

import type { Advisory, Finding, PackageDetails } from "../model/types";

/**
 * The scheme allowlist is the control against a `javascript:` URL in data the page did not write;
 * the character blocklist keeps a value inside the quoted attribute it lands in.
 */
export function safeHref(url: unknown): string | null {
  const value = typeof url === "string" ? url.trim() : "";

  return /^https?:\/\/[^\s<>"']+$/i.test(value) ? value : null;
}

/** Whether a repository was asked about the package: the finding's own field, else its lock entry's,
 *  which states the same fact; null where neither says. */
export function fromComposerRepository(
  finding: Pick<Finding, "package" | "fromComposerRepository">,
  details: ReadonlyMap<string, PackageDetails>,
): boolean | null {
  return finding.fromComposerRepository ?? details.get(finding.package)?.lock?.fromComposerRepository ?? null;
}

/** True is still the page's assumption: Private Packagist writes the same flag. */
export function packagistUrl(
  finding: Pick<Finding, "package" | "fromComposerRepository">,
  details: ReadonlyMap<string, PackageDetails>,
): string | null {
  return fromComposerRepository(finding, details) === true
    ? `https://packagist.org/packages/${finding.package}`
    : null;
}

/** The NVD page for an advisory that carries a CVE id; a GHSA-only id has nowhere to link. */
export function cveUrl(advisory: Pick<Advisory, "cve">): string | null {
  return advisory.cve && /^CVE-/.test(advisory.cve)
    ? `https://nvd.nist.gov/vuln/detail/${advisory.cve}`
    : null;
}

/** A repository URL's host without `www.`, or `"repository"` for anything but an http(s) URL. */
export function repoHost(url: string | null): string {
  const match = /^https?:\/\/([^/]+)/.exec(url ?? "");
  const host = match?.[1];

  return host ? host.replace(/^www\./, "") : "repository";
}
