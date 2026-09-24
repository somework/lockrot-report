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

function renderIn(ui: ComponentChild, openGlossary: () => void = vi.fn()) {
  const model = loadMini();
  const value: ReportContextValue = {
    model,
    state: INITIAL_STATE,
    dispatch: vi.fn(),
    now: new Date(model.report.generatedAt),
    wide: true,
    openGlossary,
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

    it('"In the glossary" opens the glossary through the report context', () => {
      // Arrange
      const openGlossary = vi.fn();
      renderIn(<Pill word="pinned" docs />, openGlossary);

      // Act
      fireEvent.click(screen.getByRole("button", { name: /in the glossary/i }));

      // Assert
      expect(openGlossary).toHaveBeenCalledTimes(1);
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
