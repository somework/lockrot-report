import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import type { ComponentChild } from "preact";
import { INITIAL_STATE } from "../../../src/state/types";
import type { Model } from "../../../src/model/types";
import { normalize } from "../../../src/model/normalize";
import { ReportContext, type ReportContextValue } from "../../../src/ui/context";
import { Pill } from "../../../src/ui/common/common";

afterEach(cleanup);

function loadMini(): Model {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", "mini.json"), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error("mini.json failed to normalize");
  return result.model;
}

function renderIn(ui: ComponentChild, openGlossaryFrom: (returnTo: HTMLElement | null) => void = vi.fn()) {
  const model = loadMini();
  const value: ReportContextValue = {
    model,
    state: INITIAL_STATE,
    dispatch: vi.fn(),
    now: new Date(model.report.generatedAt),
    wide: true,
    openGlossary: vi.fn(),
    openGlossaryFrom,
  };
  return render(<ReportContext.Provider value={value}>{ui}</ReportContext.Provider>);
}

describe("Pill", () => {
  it("without docs renders a plain, non-interactive span carrying the definition as a title", () => {
    // Arrange / Act
    renderIn(<Pill word="abandoned" />);

    // Assert: nothing to click, no popover — findByRole would throw if one existed.
    expect(screen.queryByRole("button")).toBeNull();
    const pill = screen.getByText("abandoned");
    expect(pill.tagName).toBe("SPAN");
    expect(pill.getAttribute("title")).toMatch(/Composer repository marks it abandoned/);
  });

  describe("with docs (PD-GLOSSARY-4)", () => {
    it("is a button, not a link out to lockrot.dev, so it still works with no network", () => {
      // Arrange / Act
      renderIn(<Pill word="abandoned" docs />);

      // Assert
      expect(screen.queryByRole("link", { name: "abandoned" })).toBeNull();
      const button = screen.getByRole("button", { name: "abandoned" });
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("popovertarget")).toBeTruthy();
    });

    it("carries a popover holding the same definition, unique per instance", () => {
      // Arrange / Act: two pills for the same word, as a Findings row and its open detail would
      // both render at once (DESIGN.md §8's wide layout).
      renderIn(
        <>
          <Pill word="silent" docs />
          <Pill word="silent" docs />
        </>,
      );

      // Assert: one popover per button, and each button points at its own.
      const buttons = screen.getAllByRole("button", { name: "silent" });
      expect(buttons).toHaveLength(2);
      const targets = buttons.map((b) => b.getAttribute("popovertarget"));
      expect(new Set(targets).size).toBe(2);
      for (const target of targets) {
        const popover = document.getElementById(target ?? "");
        expect(popover?.getAttribute("popover")).toBe("auto");
        expect(popover?.textContent).toMatch(/no repository push/);
      }
    });

    it('"In the glossary" opens the glossary through the report context, passing the pill itself back for focus (a11y review)', () => {
      // Arrange
      const openGlossaryFrom = vi.fn();
      renderIn(<Pill word="pinned" docs />, openGlossaryFrom);
      const pillButton = screen.getByRole("button", { name: "pinned" });

      // Act
      fireEvent.click(screen.getByRole("button", { name: /in the glossary/i }));

      // Assert: the pill itself, not the "In the glossary" button that hides its own popover in
      // the same click and so cannot be a useful place to return focus to.
      expect(openGlossaryFrom).toHaveBeenCalledTimes(1);
      expect(openGlossaryFrom).toHaveBeenCalledWith(pillButton);
    });

    it("links out to lockrot.dev's verdicts section for whoever does have a network", () => {
      // Arrange / Act
      renderIn(<Pill word="stale" docs />);

      // Assert
      const out = screen.getByRole("link", { name: "lockrot.dev" });
      expect(out.getAttribute("href")).toBe("https://lockrot.dev/verdicts/#the-nine-verdicts");
    });
  });
});
