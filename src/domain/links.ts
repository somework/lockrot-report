/** URLs the page may put in an `href`, or `null` when it may not. */

import type { Finding } from "../model/report";

/**
 * The scheme allowlist is the control against a `javascript:` URL in data the page did not write;
 * the character blocklist keeps a value inside the quoted attribute it lands in.
 */
export function safeHref(url: unknown): string | null {
  const value = typeof url === "string" ? url.trim() : "";

  return /^https?:\/\/[^\s<>"']+$/i.test(value) ? value : null;
}

/** One out-link of the detail sheet's header: its URL, its visible text and its accessible name. */
export interface HeaderLink {
  href: string;
  text: string;
  name: string;
}

const NEW_TAB = ", opens in a new tab";

/** The host the browser goes to, as its own URL parser reads it, without `www.`. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * SPEC §7.9.8: the repository by its host, then the registry page by its name. Both URLs are
 * lockrot's as written, never built; a null or refused one leaves its link out.
 */
export function headerLinks(
  { origin, activity }: Pick<Finding, "origin" | "activity">,
  repositoryLink: string | null,
): HeaderLink[] {
  const links: HeaderLink[] = [];
  const repo = safeHref(repositoryLink);
  const host = repo === null ? null : hostOf(repo);
  if (repo !== null && host !== null) {
    const archived = activity.archived === true ? " (archived)" : "";
    links.push({ href: repo, text: `${host} ↗${archived}`, name: `${host} repository${archived}${NEW_TAB}` });
  }
  const registry = safeHref(origin.package_url);
  if (registry !== null) {
    const page = origin.registry === null ? "registry page" : `${origin.registry} page`;
    links.push({
      href: registry,
      text: `${origin.registry ?? page} ↗`,
      name: `${page} of this package${NEW_TAB}`,
    });
  }
  return links;
}
