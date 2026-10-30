import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { SHORTCUTS_KEY } from "../../../src/ui/useShortcutsSwitch";

function composite(): Model {
  const result = normalize(assembleEmbed("composite"));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

const openPackage = (): string | null => new URLSearchParams(location.hash.slice(1)).get("pkg");

function openGlossaryKeys(): HTMLInputElement {
  fireEvent.click(screen.getByRole("button", { name: "What these words mean" }));
  return screen.getByRole("checkbox", { name: "Keyboard shortcuts" });
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  window.localStorage.clear();
  history.replaceState(null, "", "/report.html#view=findings");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// PD-GLOSSARY-12, WCAG 2.1.4: a single-character shortcut must have an off switch.
describe("the Keyboard shortcuts switch in the glossary", () => {
  test("is on by default, and j opens the first row", () => {
    render(<App model={composite()} />);

    expect(openGlossaryKeys().checked).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.keyDown(document.body, { key: "j" });

    expect(openPackage()).toBe("twig/twig");
  });

  test("turned off, leaves j to the browser and keeps the choice in storage", () => {
    render(<App model={composite()} />);

    fireEvent.click(openGlossaryKeys());
    fireEvent.keyDown(document.body, { key: "Escape" });
    const j = fireEvent.keyDown(document.body, { key: "j" });

    expect(j).toBe(true);
    expect(openPackage()).toBeNull();
    expect(window.localStorage.getItem(SHORTCUTS_KEY)).toBe("off");
  });

  test("reads the saved choice on the next visit", () => {
    window.localStorage.setItem(SHORTCUTS_KEY, "off");
    render(<App model={composite()} />);

    expect(openGlossaryKeys().checked).toBe(false);
  });

  test("stays on and still switches off for this visit when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<App model={composite()} />);
    const box = openGlossaryKeys();

    expect(box.checked).toBe(true);
    fireEvent.click(box);
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.keyDown(document.body, { key: "j" });

    expect(openPackage()).toBeNull();
  });
});
