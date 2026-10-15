import { createRef } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import type { ComponentChild } from "preact";
import { assembleEmbed } from "../../../scripts/report2-embed";
import type { Action, State } from "../../../src/state/types";
import { INITIAL_STATE } from "../../../src/state/types";
import type { Model } from "../../../src/model/types";
import { normalize } from "../../../src/model/normalize";
import { ReportContext } from "../../../src/ui/context";
import { SearchBar } from "../../../src/ui/search/SearchBar";

afterEach(cleanup);

function load(caseName: string): Model {
  const result = normalize(assembleEmbed(caseName));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

/** 7 graded findings (3 critical, 2 high, 2 low), 20 counted advisories on 4 packages, one
 *  exposure entry and 6 flagged direct requirements outside it. */
const composite = () => load("composite");

/** One package, verdict `ok`: nothing flagged, no advisory. */
const clean = () => load("pagerfanta");

function renderIn(
  ui: ComponentChild,
  model: Model,
  state: State,
  dispatch: (action: Action) => void = vi.fn(),
) {
  return render(
    <ReportContext.Provider
      value={{
        model,
        state,
        dispatch,
        now: new Date(model.report.generated_at),
        wide: true,
        cursor: null,
        openGlossary: vi.fn(),
      }}
    >
      {ui}
    </ReportContext.Provider>,
  );
}

function renderBar(model: Model, state: State, dispatch?: (action: Action) => void) {
  return renderIn(<SearchBar inputRef={createRef<HTMLInputElement>()} />, model, state, dispatch);
}

function countLine(): string {
  return screen.getByRole("status").textContent;
}

describe("SearchBar", () => {
  it("renders the search box with an accessible label and a placeholder that names the report-2 keys", () => {
    renderBar(composite(), INITIAL_STATE);

    const input = screen.getByRole("searchbox", { name: "Filter packages" });
    const placeholder = input.getAttribute("placeholder") ?? "";
    expect(placeholder).toContain("flag:");
    expect(placeholder).toContain("score:");
  });

  it("dispatches a query action as the reader types", () => {
    const dispatch = vi.fn();
    renderBar(composite(), INITIAL_STATE, dispatch);

    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "guzzle" } });

    expect(dispatch).toHaveBeenCalledWith({ type: "query", q: "guzzle" });
  });

  it("enables Clear once the query is non-blank, and dispatches clear when it is clicked", () => {
    const dispatch = vi.fn();
    renderBar(composite(), { ...INITIAL_STATE, q: "guzzle" }, dispatch);

    const clear = screen.getByRole("button", { name: /clear/i });
    expect(clear.hasAttribute("disabled")).toBe(false);
    fireEvent.click(clear);

    expect(dispatch).toHaveBeenCalledWith({ type: "clear" });
  });

  it("disables Clear with no query and no filter", () => {
    renderBar(composite(), INITIAL_STATE);

    expect(screen.getByRole("button", { name: /clear/i }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps Clear disabled for a whitespace-only query and counts no filter on", () => {
    renderBar(composite(), { ...INITIAL_STATE, q: "   " });

    expect(screen.getByRole("button", { name: /clear/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText(/filters? on/)).toBeNull();
  });

  it("counts the Findings tab against the graded findings", () => {
    renderBar(composite(), INITIAL_STATE);

    expect(countLine()).toBe("7 of 7 flagged packages");
  });

  it("singularises the noun at one", () => {
    renderBar(load("B"), INITIAL_STATE);

    expect(countLine()).toBe("1 of 1 flagged package");
  });

  it("narrows the count and shows the active-filter suffix once a filter is selected", () => {
    const state: State = { ...INITIAL_STATE, filters: { ...INITIAL_STATE.filters, verdict: ["critical"] } };

    renderBar(composite(), state);

    // `counts.critical` of the document is 3.
    expect(countLine()).toContain("3 of 7 flagged packages");
    expect(countLine()).toContain("1 filter on");
  });

  it("counts the All packages tab against every finding, not just the flagged ones", () => {
    const state: State = { ...INITIAL_STATE, view: "packages" };

    renderBar(composite(), state);

    expect(countLine()).toBe("7 of 7 packages");
  });

  it("counts the Advisories tab in advisories, against the document's counted total", () => {
    renderBar(composite(), { ...INITIAL_STATE, view: "advisories" });

    expect(countLine()).toBe("20 of 20 advisories");
  });

  it("counts the Blast radius tab in direct requirements, and the flagged ones the exposure list leaves out", () => {
    renderBar(composite(), { ...INITIAL_STATE, view: "radius" });

    expect(countLine()).toBe(
      "1 of 1 direct requirement on the exposure list, plus 6 of 6 flagged ones with nothing flagged counted under them",
    );
  });

  it("hides the search box and hint, but keeps the count line, on a report with nothing flagged", () => {
    renderBar(clean(), INITIAL_STATE);

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
    expect(countLine()).toBe("0 of 0 flagged packages");
  });

  it("draws no count line on Advisories when the document holds no advisory at all", () => {
    renderBar(clean(), { ...INITIAL_STATE, view: "advisories" });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing at all on the Run tab, which has no count to give", () => {
    const { container } = renderBar(composite(), { ...INITIAL_STATE, view: "run" });

    expect(container.textContent).toBe("");
  });
});

describe("the open package and the count line", () => {
  it("says nothing extra while the open package still matches the current filters", () => {
    renderBar(composite(), { ...INITIAL_STATE, pkg: "twig/twig" });

    expect(countLine()).not.toContain("hidden by the current filters");
  });

  it("names the open package once a search term hides it from the tab it belongs to", () => {
    renderBar(composite(), { ...INITIAL_STATE, pkg: "twig/twig", q: "no-such-package" });

    expect(countLine()).toContain("0 of 7 flagged packages");
    expect(countLine()).toContain("twig/twig is hidden by the current filters");
  });

  it("says nothing extra for an open package the tab never lists at all", () => {
    // pagerfanta/twig is `ok`: never in the Findings population, filters or not.
    renderBar(clean(), { ...INITIAL_STATE, pkg: "pagerfanta/twig", q: "no-such-package" });

    expect(countLine()).not.toContain("hidden by the current filters");
  });
});

describe("the active-filters line", () => {
  it("draws one removable chip per selected filter and one for the search", () => {
    const dispatch = vi.fn();
    const state: State = {
      ...INITIAL_STATE,
      q: "symfony",
      filters: { ...INITIAL_STATE.filters, flag: ["stale"], scope: ["direct"] },
    };
    renderBar(composite(), state, dispatch);

    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Flag stale" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "toggle", group: "flag", key: "stale" });
    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Scope Direct" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "toggle", group: "scope", key: "direct" });
    fireEvent.click(screen.getByRole("button", { name: /^Remove filter: Search/ }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "query", q: "" });
  });

  it("draws no chip when nothing narrows the list, and none for the accepted toggle", () => {
    const state: State = { ...INITIAL_STATE, filters: { ...INITIAL_STATE.filters, accepted: ["hide"] } };
    renderBar(composite(), state);

    expect(screen.queryByText("Filtered by")).toBeNull();
  });
});
