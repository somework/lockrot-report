import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Report2Embed } from "../../../src/model/report";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";

function load(caseName: string, edit: (embed: Report2Embed) => void = () => undefined): Model {
  const embed = assembleEmbed(caseName);
  edit(embed);
  const result = normalize(embed);
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

/** The composite case: graded findings in three grades, no baseline, no project name. */
const composite = () => load("composite");

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  history.replaceState(null, "", "/report.html");
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
  vi.restoreAllMocks();
});

function printDoc(container: Element): HTMLElement {
  const node = container.querySelector<HTMLElement>(".print-doc");
  if (node === null) throw new Error("App rendered no .print-doc host");
  return node;
}

function sectionTitles(doc: HTMLElement): string[] {
  return [...doc.querySelectorAll(".pd-title")].map((h) => h.textContent);
}

describe("the printed report (print/PrintDocument.tsx)", () => {
  it("is not in the page on screen: the host stays empty until the page prints", () => {
    const { container } = render(<App model={composite()} />);

    expect(printDoc(container).childElementCount).toBe(0);
  });

  it("mounts on beforeprint, in sections whatever tab is open, and empties on afterprint", () => {
    // Arrange: the reader is on Advisories.
    window.location.hash = "#view=advisories";
    const { container } = render(<App model={composite()} />);

    // Act
    window.dispatchEvent(new Event("beforeprint"));

    // Assert: mounted synchronously, before the browser lays the pages out.
    const doc = printDoc(container);
    expect(sectionTitles(doc)).toEqual([
      "1Summary",
      "2Findings",
      "3Advisories",
      "4Blast radius",
      "5Run data",
    ]);
    expect(doc.querySelector(".pd-intro")?.textContent).toContain("Printed from the Advisories tab.");
    expect(doc.querySelector(".pd-intro-note")?.textContent).toContain("All packages is left out");

    window.dispatchEvent(new Event("afterprint"));
    expect(doc.childElementCount).toBe(0);
  });

  it("adds All packages, and says why, only when the reader printed from that tab", () => {
    window.location.hash = "#view=packages";
    const { container } = render(<App model={composite()} />);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    expect(sectionTitles(doc).at(-1)).toBe("6All packages");
    expect(doc.querySelector(".pd-packages .pd-lede")?.textContent).toContain(
      "Printed because the page was open on All packages: 9 packages",
    );
  });

  it("prints every finding whatever the screen filters, and says the filters do not apply", () => {
    // Arrange: a query that leaves one of the nine rows on screen.
    window.location.hash = "#q=tubalmartin";
    const { container } = render(<App model={composite()} />);
    expect(container.querySelectorAll("main .shell-main [data-pkg]")).toHaveLength(1);

    // Act
    window.dispatchEvent(new Event("beforeprint"));

    // Assert
    const doc = printDoc(container);
    const rows = [...doc.querySelectorAll(".pd-findings [data-pkg]")].map((row) =>
      row.getAttribute("data-pkg"),
    );
    expect(rows).toEqual([
      "twig/twig",
      "symfony/monolog-bridge",
      "guzzlehttp/guzzle",
      "symfony/debug",
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
      "friendsofsymfony/oauth2-php",
    ]);
    expect(doc.querySelector(".pd-intro-note")?.textContent).toContain("do not apply");
  });

  it("repeats the column head over each printed grade group, and once on screen", () => {
    window.location.hash = "#view=findings";
    const { container } = render(<App model={composite()} />);
    expect(container.querySelectorAll(".f2-head")).toHaveLength(1);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    const groups = [...doc.querySelectorAll(".pd-findings .fgroup")];
    expect(groups.map((group) => group.querySelector(".fgroup-head h2")?.textContent)).toEqual([
      "critical",
      "high",
      "low",
    ]);
    for (const group of groups) expect(group.querySelector(":scope > .f2-head")).not.toBeNull();
    expect(doc.querySelectorAll(".pd-findings .f2-ledger > .f2-head")).toHaveLength(0);
  });

  it("prints every range of a folded affected_versions, with no disclosure", () => {
    window.location.hash = "#view=advisories";
    const { container } = render(<App model={composite()} />);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    expect(doc.querySelectorAll("details.ac2-fold")).toHaveLength(0);
    const counts = [...doc.querySelectorAll(".ac2-count")];
    expect(counts.length).toBeGreaterThan(0);
    // One line that runs on as the field writes it, and wraps only after a range's own "|".
    for (const count of counts) {
      const range = count.nextElementSibling;
      expect(range?.classList.contains("ac2-flow")).toBe(true);
      expect(range?.querySelectorAll("wbr").length).toBeGreaterThan(1);
      expect(range?.querySelectorAll(".ac2-r").length).toBe(range?.querySelectorAll("wbr").length);
      expect(range?.textContent).toMatch(/\|/);
    }
  });

  it("prints All packages' column heads as words, not sort buttons", () => {
    window.location.hash = "#view=packages";
    const { container } = render(<App model={composite()} />);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    const heads = [...doc.querySelectorAll(".pd-packages thead th")];
    expect(heads.map((th) => th.textContent)).toEqual([
      "Package",
      "Version",
      "Libyears",
      "Age",
      "Verdict ↑",
      "Score",
      "Flags",
      "Reached",
      "Signals",
    ]);
    expect(doc.querySelectorAll(".pd-packages thead button")).toHaveLength(0);
  });

  // A sort button in a head cell prints empty on a continuation page, where the head repeats.
  it("prints All packages in the order the reader sorted it", () => {
    window.location.hash = "#view=packages";
    const { container } = render(<App model={composite()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Score/ }));

    window.dispatchEvent(new Event("beforeprint"));

    // Score, highest first: monolog-bridge and debug (36), twig (32), then the two highs (18).
    const rows = [...printDoc(container).querySelectorAll(".pd-packages tr[data-pkg]")].map((row) =>
      row.getAttribute("data-pkg"),
    );
    expect(rows.slice(0, 3)).toEqual(["symfony/monolog-bridge", "symfony/debug", "twig/twig"]);
  });

  it("prints the whole band once, as Overview's content, and the Advisories and Blast radius sections without its parts", () => {
    window.location.hash = "#view=advisories";
    const { container } = render(<App model={composite()} />);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    expect(doc.querySelectorAll('[data-surface="overview"]')).toHaveLength(1);
    expect(doc.querySelector('.pd-summary [data-surface="overview"] .overview2-flag-bars')).not.toBeNull();
    expect(doc.querySelectorAll(".ledger-advisories")).toHaveLength(1);
    expect(doc.querySelector(".al-lead")).toBeNull();
    expect(doc.querySelector('[data-surface="advisories"] .al-answer')?.textContent).toBe(
      "29 advisories on 5 packages, by severity: 1 critical, 5 high, 12 medium, 2 unrated, 9 low.",
    );
    expect(doc.querySelector('[data-surface="radius"]')?.textContent).not.toContain(
      "named by no line of composer.json",
    );
  });

  it("prints the grade line, the figure line and Weighs most as text, and Overview once from Overview", () => {
    window.location.hash = "";
    const { container } = render(<App model={composite()} />);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    expect(doc.querySelectorAll('[data-surface="overview"]')).toHaveLength(1);
    expect(doc.querySelector(".pd-summary .ov-grade")?.textContent).toBe(
      "Project grade: critical · 4 critical findings · 6 of 9 packages high or worse",
    );
    expect(doc.querySelector(".pd-summary .ov-figure")?.textContent).toBe(
      "9 of 9 packages flagged · 0 ok · 0 finished",
    );
    expect(doc.querySelector(".pd-summary .wm-load")?.textContent).toBe(
      "180 points on 9 flagged packages · 172 (95 %) from high or worse · score model 1",
    );
    expect(
      [...doc.querySelectorAll(".pd-summary .wm-list .wm-terms")].map((text) => text.textContent),
    ).toHaveLength(9);
    expect(doc.querySelector(".pd-summary .wm-list .wm-terms")?.textContent).toBe(
      "left-behind 16 · old-promise 4 · vulnerable 16",
    );
  });

  it("prints a lock with nothing in it as one line per section, without a note about All packages", () => {
    const empty = load("composite", (embed) => {
      embed.report.packages_checked = 0;
      embed.report.packages_flagged = 0;
      embed.report.findings = [];
      embed.report.exposure = [];
    });
    const { container } = render(<App model={empty} />);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    expect(doc.querySelector(".pd-summary .pd-lede")?.textContent).toBe("No packages in this lock.");
    expect(doc.querySelector('.pd-summary [data-surface="overview"] .waffle')).toBeNull();
    expect(doc.querySelector(".pd-intro-note")).toBeNull();
  });

  it("sets the running line the @page header prints as a CSS string on <html>", () => {
    render(<App model={load("B")} />);

    window.dispatchEvent(new Event("beforeprint"));

    // B: project matomo/matomo, generated 2026-10-01, lockrot 0.14.0.
    expect(document.documentElement.style.getPropertyValue("--lr-running-head")).toBe(
      '"matomo/matomo  ·  data as of 2026-10-01  ·  lockrot 0.14.0"',
    );
  });

  it("names the lock file in the running line when the run names no project", () => {
    render(<App model={composite()} />);

    window.dispatchEvent(new Event("beforeprint"));

    expect(document.documentElement.style.getPropertyValue("--lr-running-head")).toContain(
      '"composer.lock  ·  ',
    );
  });
});

/** happy-dom's navigator has no writable clipboard; each test puts its own in place. */
function stubClipboard(clipboard: { writeText: (text: string) => Promise<void> }): void {
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
}

describe("the header's print and share controls", () => {
  it("Print / PDF calls the browser's print", () => {
    // happy-dom has no window.print; the browser always does.
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<App model={composite()} />);

    fireEvent.click(screen.getByRole("button", { name: "Print / PDF" }));

    expect(print).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("Copy summary writes the three-line summary to the clipboard and says so", async () => {
    // Arrange
    const writeText = vi.fn((_text: string) => Promise.resolve());
    stubClipboard({ writeText });
    render(<App model={composite()} />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Summary copied to the clipboard").getAttribute("aria-live")).toBe("polite");
    });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0].split("\n")).toHaveLength(3);
  });

  it("falls back to the text, selected in a popover, when the clipboard refuses", async () => {
    stubClipboard({ writeText: () => Promise.reject(new Error("denied")) });
    render(<App model={composite()} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    const area = await screen.findByLabelText(/Select and copy these three lines/);
    expect((area as HTMLTextAreaElement).value.split("\n")).toHaveLength(3);
    vi.unstubAllGlobals();
  });
});
