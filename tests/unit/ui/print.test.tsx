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
    expect(summaryFor(model)).toContain("51 in production, 18 dev-only; 20 required directly, 49 pulled in");
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
