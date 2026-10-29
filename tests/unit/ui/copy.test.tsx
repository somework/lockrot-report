import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assembleEmbed, report2Pages } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { useCopy } from "../../../src/ui/common/useCopy";

const MANUAL_SUMMARY =
  "The clipboard is not available. The summary is selected: press Ctrl+C or Command+C to copy it.";

function model(name = "B"): Model {
  const result = normalize(assembleEmbed(name));
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

      fireEvent.click(within(sheet).getByRole("button", { name: /^Copy / }));

      await waitFor(() => {
        expect(liveRegion(sheet)?.textContent).toBe("Select it and copy");
      });
      const pre = sheet.querySelector(".d2-copy-cmd");
      expect(within(sheet).getByRole("button", { name: /^Select it and copy / })).toBeTruthy();
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

    fireEvent.click(within(sheet).getByRole("button", { name: /^Copy / }));
    await waitFor(() => {
      expect(region.textContent).toBe("Copied");
    });
    fireEvent.click(within(sheet).getByRole("button", { name: /^Copied / }));
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

const accessibleName = (button: Element): string => button.getAttribute("aria-label") ?? button.textContent;

// WCAG 2.4.6, 4.1.2 and 2.5.3: each copy control is told apart by the package it copies for, and
// its name starts with, or holds, the words a reader sees on it.
describe("the name of each copy control", () => {
  test("on Overview names each first move's package", () => {
    history.replaceState(null, "", "/report.html");
    render(<App model={model("mc-composite-dagger")} />);
    const moves = [...document.querySelectorAll(".ov-move")];

    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      const pkg = move.querySelector(".ov-move-pkg")?.textContent ?? "";
      const copy = move.querySelector(".d2-copy-btn");
      const shell = move.querySelector(".d2-shell-btn");
      expect(accessibleName(copy as Element)).toBe(`Copy ${pkg}`);
      expect(accessibleName(shell as Element)).toBe(`Shell: POSIX for ${pkg}`);
      expect(accessibleName(shell as Element)).toContain(shell?.textContent ?? "-");
    }
    const names = [...document.querySelectorAll(".d2-copy-btn")].map(accessibleName);
    expect(new Set(names).size).toBe(names.length);
  });

  test("in a detail with a Then card names the package and the step, and no two names match", () => {
    history.replaceState(null, "", `/report.html#pkg=${encodeURIComponent("symfony/monolog-bridge")}`);
    render(<App model={model("B-also-dagger")} />);
    const sheet = document.querySelector<HTMLElement>('[data-surface="detail"]');
    const names = [...(sheet?.querySelectorAll(".d2-copy-btn") ?? [])].map(accessibleName);
    const shells = [...(sheet?.querySelectorAll(".d2-shell-btn") ?? [])].map(accessibleName);

    expect(names).toEqual(["Copy symfony/monolog-bridge", "Copy symfony/monolog-bridge, step 2"]);
    expect(shells).toEqual([
      "Shell: POSIX for symfony/monolog-bridge",
      "Shell: POSIX for symfony/monolog-bridge, step 2",
    ]);
  });

  test("keeps the package after a copy changes the visible word", async () => {
    stubClipboard({ writeText: () => Promise.resolve() });
    const sheet = openSheet();
    const pkg = model().report.findings[0]?.package ?? "";

    fireEvent.click(within(sheet).getByRole("button", { name: `Copy ${pkg}` }));

    await waitFor(() => {
      expect(within(sheet).getByRole("button", { name: `Copied ${pkg}` })).toBeTruthy();
    });
  });

  test("two advisories under one CVE give their folded ranges two names", () => {
    const page = report2Pages().find(({ name }) => name === "report2-page-drupal-site");
    if (page === undefined) throw new Error("no drupal-site page");
    const result = normalize(page.embed);
    if (!result.ok) throw new Error(result.error.message);
    history.replaceState(null, "", `/report.html#pkg=${encodeURIComponent("drupal/core")}`);
    render(<App model={result.model} />);
    const names = [...document.querySelectorAll(".d3-range-btn")].map(accessibleName);

    expect(names.filter((name) => name.endsWith("CVE-2023-5256"))).toEqual([]);
    expect(names.length).toBeGreaterThan(1);
    expect(names.length - new Set(names).size).toBe(0);
  });

  test("the folded Affects range names its advisory", () => {
    const sheet = openSheet();
    const button = sheet.querySelector(".d3-range-btn");
    const head = button?.closest(".d3-adv");
    const advisory =
      (head?.querySelector(".d3-adv-src") ?? head?.querySelector(".d3-adv-id"))?.textContent ?? "";

    expect(advisory).not.toBe("");
    expect(accessibleName(button as Element)).toBe(`${button?.textContent ?? ""} for ${advisory}`);
    expect(accessibleName(button as Element)).toMatch(/^\d+ ranges for /);
  });
});

describe("useCopy", () => {
  test("ignores a clipboard refusal that arrives after a reset", async () => {
    let refuse: (error: Error) => void = () => undefined;
    stubClipboard({
      writeText: () =>
        new Promise<void>((_, reject) => {
          refuse = reject;
        }),
    });
    const onManual = vi.fn();
    const { result } = renderHook(() => useCopy({ copiedMs: 1000, manualMs: 1000 }));

    await act(() => {
      result.current.copy("composer update", onManual);
    });
    await act(() => {
      result.current.reset();
    });
    await act(async () => {
      refuse(new Error("denied"));
      await new Promise((settle) => setTimeout(settle, 20));
    });

    expect(result.current.status).toBe("idle");
    expect(onManual).not.toHaveBeenCalled();
  });
});
