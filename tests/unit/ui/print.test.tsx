import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { summaryFor } from "../../../src/ui/CopySummary";

function loadFixture(name: string): Model {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "bundles", name), "utf8")) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`${name} fixture failed to normalize`);
  return result.model;
}

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
    const { container } = render(<App model={loadFixture("mini.json")} />);

    expect(printDoc(container).childElementCount).toBe(0);
  });

  it("mounts on beforeprint, in sections whatever tab is open, and empties on afterprint", () => {
    // Arrange: the reader is on Advisories.
    window.location.hash = "#view=advisories";
    const { container } = render(<App model={loadFixture("mini.json")} />);

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
    const { container } = render(<App model={loadFixture("mini.json")} />);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    expect(sectionTitles(doc).at(-1)).toBe("6All packages");
    expect(doc.querySelector(".pd-packages .pd-lede")?.textContent).toContain(
      "Printed because the page was open on All packages",
    );
  });

  it("prints every finding whatever the screen filters, and says the filters do not apply", () => {
    // Arrange: a query that leaves one of mini's two flagged rows on screen.
    window.location.hash = "#q=snapshot";
    const { container } = render(<App model={loadFixture("mini.json")} />);

    // Act
    window.dispatchEvent(new Event("beforeprint"));

    // Assert
    const doc = printDoc(container);
    const rows = [...doc.querySelectorAll(".pd-findings [data-pkg]")].map((row) =>
      row.getAttribute("data-pkg"),
    );
    expect(new Set(rows)).toEqual(new Set(["vendor/transitive", "vendor/snapshot"]));
    expect(doc.querySelector(".pd-intro-note")?.textContent).toContain("do not apply");
  });

  it("lays each Findings priority group out as a table whose head, the group and the axis, repeats per page", () => {
    // Arrange
    const { container } = render(<App model={loadFixture("wallabag_wallabag.json")} />);

    // Act
    window.dispatchEvent(new Event("beforeprint"));

    // Assert: one head per group — its name and the column head with the age axis' captions — and
    // no column head of the screen's kind above the groups.
    const doc = printDoc(container);
    const groups = [...doc.querySelectorAll(".pd-findings .pf-group")];
    expect(groups.map((g) => g.querySelector(".pf-top h2")?.textContent)).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ]);
    for (const group of groups) {
      expect(group.querySelector(".pf-top .fhead-axis")?.textContent).toBe("Years since release03y5y10y+");
    }
    expect(doc.querySelectorAll(".pd-findings .fledger > .fhead")).toHaveLength(0);
    // Every row is a row of its own around the screen's grid; a run's note is a row too.
    const rows = doc.querySelectorAll(".pd-findings .pf-tr[data-pkg] > .pf-td > .frow");
    expect(rows).toHaveLength(69);
    expect(doc.querySelectorAll(".pd-findings .pf-run > .pf-note .frun-note").length).toBeGreaterThan(0);
  });

  it("prints All packages' column heads as words, not buttons, and a shared data date once", () => {
    window.location.hash = "#view=packages";
    const { container } = render(<App model={loadFixture("wallabag_wallabag.json")} />);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    const heads = [...doc.querySelectorAll(".pd-packages thead th")];
    expect(heads.map((th) => th.textContent)).toEqual([
      "Package",
      "Version",
      "Libyears",
      "Verdict ↑",
      "Priority",
      "Reached",
      "Signals",
    ]);
    expect(doc.querySelectorAll(".pd-packages thead button")).toHaveLength(0);
    expect(doc.querySelector(".pd-packages .pd-lede")?.textContent).toContain(
      "Every package's data is as of 2026-09-24.",
    );
    expect(doc.querySelector('.pd-packages tr[data-pkg="hoa/stream"]')?.textContent).toContain(
      "0.0 · newest",
    );
  });

  it("prints an empty lock as one line per section, without a note about All packages", () => {
    const { container } = render(<App model={loadFixture("empty-lockrot-self.json")} />);

    window.dispatchEvent(new Event("beforeprint"));

    const doc = printDoc(container);
    expect(doc.querySelector(".pd-summary .pd-lede")?.textContent).toBe("No packages in this lock.");
    expect(doc.querySelector(".pd-summary .ledger")).toBeNull();
    expect(doc.querySelector(".pd-intro-note")).toBeNull();
  });

  it("does not tell a reader on paper that a name opens its detail", () => {
    const { container } = render(<App model={loadFixture("koel_koel.json")} />);

    window.dispatchEvent(new Event("beforeprint"));

    const foot = printDoc(container).querySelector(".pd-radius .rl-foot")?.textContent ?? "";
    expect(foot).toContain("They are:");
    expect(foot).not.toContain("opens its detail");
  });

  it("sets the running line the @page header prints as a CSS string on <html>", () => {
    render(<App model={loadFixture("mini.json")} />);

    window.dispatchEvent(new Event("beforeprint"));

    expect(document.documentElement.style.getPropertyValue("--lr-running-head")).toBe(
      '"acme/app  ·  data as of 2026-09-24  ·  lockrot 0.11.0"',
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
    render(<App model={loadFixture("mini.json")} />);

    fireEvent.click(screen.getByRole("button", { name: "Print / PDF" }));

    expect(print).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("Copy summary writes the three-line summary to the clipboard and says so", async () => {
    // Arrange
    const model = loadFixture("wallabag_wallabag.json");
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard({ writeText });
    render(<App model={model} />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Summary copied to the clipboard").getAttribute("aria-live")).toBe("polite");
    });
    expect(writeText).toHaveBeenCalledWith(summaryFor(model));
    expect(summaryFor(model).split("\n")).toHaveLength(3);
    expect(summaryFor(model)).toContain(
      "51 in production, 18 dev-only · 20 required directly, 49 pulled in · ",
    );
  });

  it("copies the caveat with the count when the advisory check was incomplete (PD-ADV-7)", () => {
    const text = summaryFor(loadFixture("mini-advisories-partial.json"));
    expect(text).toContain(
      "6 security advisories on 5 packages (advisory check incomplete, so the list may be partial)",
    );
    expect(summaryFor(loadFixture("mini-advisories.json"))).not.toContain("incomplete");
  });

  it("falls back to the text, selected in a popover, when the clipboard refuses", async () => {
    stubClipboard({ writeText: () => Promise.reject(new Error("denied")) });
    render(<App model={loadFixture("mini.json")} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    const area = await screen.findByLabelText(/Select and copy these three lines/);
    expect((area as HTMLTextAreaElement).value.split("\n")).toHaveLength(3);
    vi.unstubAllGlobals();
  });
});
