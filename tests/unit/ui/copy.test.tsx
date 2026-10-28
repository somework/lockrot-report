import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";

const MANUAL_SUMMARY =
  "The clipboard is not available. The summary is selected: press Ctrl+C or Command+C to copy it.";

function model(): Model {
  const result = normalize(assembleEmbed("B"));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function openSheet(): HTMLElement {
  const m = model();
  const pkg = m.report.findings[0]?.package ?? "";
  history.replaceState(null, "", `/report.html#pkg=${encodeURIComponent(pkg)}`);
  render(<App model={m} />);
  const sheet = document.querySelector<HTMLElement>('[data-surface="detail"]');
  if (sheet === null) throw new Error("no detail sheet");
  return sheet;
}

/** happy-dom's navigator has no writable clipboard; each test puts its own in place, or none. */
function stubClipboard(clipboard: { writeText: (text: string) => Promise<void> } | undefined): void {
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
}

const liveRegion = (root: HTMLElement): HTMLElement | null =>
  root.querySelector<HTMLElement>('.d2-copy-bar [aria-live="polite"]');

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a command box whose clipboard fails (R6-51)", () => {
  test.each([
    ["is missing", undefined],
    ["refuses", { writeText: () => Promise.reject(new Error("denied")) }],
  ])(
    "announces the copy by hand and selects the command in a focused box when the clipboard %s",
    async (_, clipboard) => {
      stubClipboard(clipboard);
      const sheet = openSheet();

      fireEvent.click(within(sheet).getByRole("button", { name: "Copy" }));

      await waitFor(() => {
        expect(liveRegion(sheet)?.textContent).toBe("Select it and copy");
      });
      const pre = sheet.querySelector(".d2-copy-cmd");
      expect(within(sheet).getByRole("button", { name: "Select it and copy" })).toBeTruthy();
      expect(document.activeElement).toBe(pre);
      const selection = document.getSelection();
      expect(selection?.rangeCount).toBe(1);
      const common = selection?.getRangeAt(0).commonAncestorContainer ?? null;
      expect(pre?.contains(common)).toBe(true);
    },
  );

  test("announces two copies in a row twice: the region is empty between them", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard({ writeText });
    const sheet = openSheet();
    const seen: string[] = [];
    const region = liveRegion(sheet);
    if (region === null) throw new Error("no live region");
    new MutationObserver(() => seen.push(region.textContent)).observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    fireEvent.click(within(sheet).getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(region.textContent).toBe("Copied");
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Copied" }));
    await waitFor(() => {
      expect(seen.filter((text) => text === "Copied")).toHaveLength(2);
    });

    expect(seen).toContain("");
  });
});

describe("the Copy summary whose clipboard refuses (R6-51, PD-PRINT-3)", () => {
  test("selects the whole summary in a focused text box and says so, with no Popover API", async () => {
    stubClipboard({ writeText: () => Promise.reject(new Error("denied")) });
    const showPopover = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "showPopover");
    Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
    try {
      render(<App model={model()} />);

      fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

      await waitFor(() => {
        expect(screen.getByText(MANUAL_SUMMARY).getAttribute("aria-live")).toBe("polite");
      });
      const area = document.activeElement as HTMLTextAreaElement;
      expect(area.tagName).toBe("TEXTAREA");
      expect([area.selectionStart, area.selectionEnd]).toEqual([0, area.value.length]);
    } finally {
      if (showPopover !== undefined) Object.defineProperty(HTMLElement.prototype, "showPopover", showPopover);
    }
  });

  test("goes back to idle after the manual status has been read", async () => {
    stubClipboard({ writeText: () => Promise.reject(new Error("denied")) });
    render(<App model={model()} />);
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByText(MANUAL_SUMMARY)).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.queryByText(MANUAL_SUMMARY)).toBeNull();
  });
});
