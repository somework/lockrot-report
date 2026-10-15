/** URLs the page may put in an `href`, or `null` when it may not. */

/**
 * The scheme allowlist is the control against a `javascript:` URL in data the page did not write;
 * the character blocklist keeps a value inside the quoted attribute it lands in.
 */
export function safeHref(url: unknown): string | null {
  const value = typeof url === "string" ? url.trim() : "";

  return /^https?:\/\/[^\s<>"']+$/i.test(value) ? value : null;
}

/** The NVD page for an advisory that carries a CVE id; a GHSA-only id has nowhere to link. */
export function cveUrl(advisory: { readonly cve: string | null }): string | null {
  return advisory.cve && /^CVE-/.test(advisory.cve)
    ? `https://nvd.nist.gov/vuln/detail/${advisory.cve}`
    : null;
}
