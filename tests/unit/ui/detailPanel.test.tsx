import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { DetailsEntry, Report2Embed } from "../../../src/model/report";
import { App } from "../../../src/ui/App";

const B = "symfony/monolog-bridge";

function open(
  pkg: string,
  edit: (embed: Report2Embed) => Report2Embed = (e) => e,
  caseName = "B",
): HTMLElement {
  history.replaceState(null, "", `/report.html#pkg=${encodeURIComponent(pkg)}`);
  const result = normalize(edit(assembleEmbed(caseName)));
  if (!result.ok) throw new Error(result.error.message);
  render(<App model={result.model} />);
  return screen.getByRole("complementary", { name: pkg });
}

/** B's details entry; its explain-2 document always carries a lock. */
function entryOf(embed: Report2Embed): DetailsEntry & { lock: NonNullable<DetailsEntry["lock"]> } {
  const entry = embed.details[B];
  if (entry?.lock == null) throw new Error("B has a details entry with a lock");
  return { ...entry, lock: entry.lock };
}

/** Opens the folded reference titled `title` and returns its label/value pairs. */
function reference(sheet: HTMLElement, title: string): Record<string, string> {
  const summary = [...sheet.querySelectorAll(".detail-reference-summary")].find(
    (el) => el.textContent === title,
  );
  const section = summary?.closest("details");
  if (!section) throw new Error(`no reference ${title}`);
  section.open = true;
  const terms = [...section.querySelectorAll("dt")];
  return Object.fromEntries(terms.map((dt) => [dt.textContent, dt.nextElementSibling?.textContent ?? ""]));
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("1181"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
});

describe("the sheet's presence", () => {
  test("is absent while no package is open", () => {
    history.replaceState(null, "", "/report.html");
    const result = normalize(assembleEmbed("B"));
    if (!result.ok) throw new Error(result.error.message);
    render(<App model={result.model} />);

    expect(document.querySelector('[data-surface="detail"]')).toBeNull();
  });
});

describe("a package that is not in the report", () => {
  test("opens a region named after it that says so, and Close drops it from the address", () => {
    const sheet = open("vendor/does-not-exist");

    expect(sheet.textContent).toContain("vendor/does-not-exist is not in this report.");
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("complementary")).toBeNull();
    expect(location.hash).not.toContain("pkg=");
  });

  test("Close does the same on a package the report lists", () => {
    const sheet = open(B);

    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("complementary")).toBeNull();
    expect(location.hash).not.toContain("pkg=");
  });
});

describe("The lock entry reference", () => {
  test("prints the installed version and each lock field the details entry carries", () => {
    const sheet = open(B);

    // explain-2 for B: the lock's php, release date, repository and type; the finding is not dev.
    expect(reference(sheet, "The lock entry")).toEqual({
      installed: "v2.6.13",
      "php constraint": ">=5.3.3",
      released: "2015-06-25",
      repository: "https://github.com/symfony/monolog-bridge.git",
      type: "library",
    });
  });

  test("links the repository when the producer's link is safe, and prints the lock's own text otherwise", () => {
    const withLink = (link: string | null) => (embed: Report2Embed) => ({
      ...embed,
      details: { [B]: { ...entryOf(embed), repository_link: link } },
    });

    const safe = open(B, withLink("https://github.com/symfony/monolog-bridge"));
    const anchor = within(safe).getByRole("link", { name: "https://github.com/symfony/monolog-bridge" });
    expect(anchor.getAttribute("href")).toBe("https://github.com/symfony/monolog-bridge");
    cleanup();

    const unsafe = open(B, withLink("javascript:alert(1)"));
    expect(within(unsafe).queryByRole("link", { name: /alert/ })).toBeNull();
    expect(reference(unsafe, "The lock entry")["repository"]).toBe(
      "https://github.com/symfony/monolog-bridge.git",
    );
  });

  test("drops a lock field the details entry leaves out instead of printing a blank row", () => {
    const sheet = open(B, (embed) => ({
      ...embed,
      details: { [B]: { ...entryOf(embed), lock: { ...entryOf(embed).lock, php: "", type: "" } } },
    }));

    expect(Object.keys(reference(sheet, "The lock entry"))).toEqual(["installed", "released", "repository"]);
  });

  test("dates a branch snapshot's commit as a snapshot, never as a release", () => {
    const sheet = open(B, (embed) => ({
      ...embed,
      details: { [B]: { ...entryOf(embed), lock: { ...entryOf(embed).lock, branch_snapshot: true } } },
    }));

    const rows = reference(sheet, "The lock entry");
    expect(rows["snapshot dated"]).toBe("2015-06-25");
    expect(rows["branch snapshot"]).toBe("yes");
    expect(rows).not.toHaveProperty("released");
  });
});

describe("a package with no details entry", () => {
  const TWIG = "twig/twig";

  test("still prints its guaranteed lock row, and nothing the document does not carry", () => {
    const sheet = open(TWIG, (e) => e, "composite");

    expect(reference(sheet, "The lock entry")).toEqual({ installed: "v2.16.1" });
  });

  test("still prints where it came from, with no dates or release count to invent", () => {
    const sheet = open(TWIG, (e) => e, "composite");

    expect(reference(sheet, "Provenance")).toEqual({
      origin: "packagist",
      registry: "packagist.org",
      "package metadata": "read",
      "repository activity": "read",
      fetched: "2026-09-14",
    });
  });

  test("says why a source was not read next to its status", () => {
    const sheet = open("symfony/polyfill-intl-idn", (e) => e, "composite");

    // composite: its repository activity was not asked because the package is allowlisted.
    expect(reference(sheet, "Provenance")["repository activity"]).toBe("not_read (allowlisted)");
    expect(reference(sheet, "Provenance")).not.toHaveProperty("fetched");
  });
});

describe("The provenance reference", () => {
  test("names the origin kind and registry, the status of each source and the dates", () => {
    const sheet = open(B);

    // report-2 B: origin packagist.org, metadata and activity both read, fetched 2026-09-14.
    expect(reference(sheet, "Provenance")).toEqual({
      origin: "packagist",
      registry: "packagist.org",
      "package metadata": "read",
      "metadata as of": "2026-10-01",
      "releases listed": "15",
      "repository activity": "read",
      fetched: "2026-09-14",
    });
  });

  test("says a local package was installed from a local path, and leaves the line out for any other", () => {
    const local = open(B, (embed) => ({
      ...embed,
      report: {
        ...embed.report,
        findings: embed.report.findings.map((f) => ({ ...f, origin: { ...f.origin, local: true } })),
      },
    }));
    expect(reference(local, "Provenance")["installed from a local path"]).toBe("yes");
    cleanup();

    expect(reference(open(B), "Provenance")).not.toHaveProperty("installed from a local path");
  });

  test("keeps an origin kind the page does not know as written", () => {
    const sheet = open(B, (embed) => ({
      ...embed,
      report: {
        ...embed.report,
        findings: embed.report.findings.map((f) => ({ ...f, origin: { ...f.origin, kind: "acme:mirror" } })),
      },
    }));

    expect(reference(sheet, "Provenance")["origin"]).toBe("acme:mirror");
  });
});
