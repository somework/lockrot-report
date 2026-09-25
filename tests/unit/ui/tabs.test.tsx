import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/preact";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { INITIAL_STATE, type State } from "../../../src/state/types";
import { ReportContext } from "../../../src/ui/context";
import { Tabs } from "../../../src/ui/Tabs";

afterEach(cleanup);

function loadMini(): Model {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", "mini.json"), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error("mini.json fixture failed to normalize");
  return result.model;
}

function renderTabs(state: State = INITIAL_STATE) {
  const model = loadMini();
  return render(
    <ReportContext.Provider
      value={{
        model,
        state,
        dispatch: vi.fn(),
        now: new Date(model.report.generatedAt),
        wide: true,
        cursor: null,
        openGlossary: vi.fn(),
        openGlossaryFrom: vi.fn(),
      }}
    >
      <Tabs idBase="t" panelId="panel" />
    </ReportContext.Provider>,
  );
}

describe("Tabs' overflow chevrons (PD-TABS-1)", () => {
  it("keep the tab list the only thing a keyboard or screen reader meets: one Tab stop, chevrons hidden from both", () => {
    // Arrange + Act
    const { container } = renderTabs({ ...INITIAL_STATE, view: "radius" });

    // Assert: the roving tabindex is untouched — only the selected tab is in the Tab order.
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    const chevrons = [...container.querySelectorAll<HTMLButtonElement>(".tabs-scroll")];
    expect(chevrons).toHaveLength(2);
    for (const chevron of chevrons) {
      expect(chevron.tabIndex).toBe(-1);
      expect(chevron.getAttribute("aria-hidden")).toBe("true");
      // The list is not wider than itself under happy-dom (no layout): nothing to scroll to.
      expect(chevron.hidden).toBe(true);
    }
    // Nothing but tabs inside the tab list itself.
    expect(screen.getByRole("tablist").querySelectorAll(":scope > :not([role='tab'])")).toHaveLength(0);
  });

  it("marks neither edge when the row fits", () => {
    const { container } = renderTabs();
    expect(container.querySelector(".tabs-strip")?.className).toBe("tabs-strip");
  });
});
