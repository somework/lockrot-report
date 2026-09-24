import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRef } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import type { ComponentChild } from "preact";
import type { Action, State } from "../../../src/state/types";
import { INITIAL_STATE } from "../../../src/state/types";
import type { Model } from "../../../src/model/types";
import { normalize } from "../../../src/model/normalize";
import { ReportContext } from "../../../src/ui/context";
import { SearchBar } from "../../../src/ui/search/SearchBar";

afterEach(cleanup);

function loadFixture(name: string): Model {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "bundles", name), "utf8")) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`${name} fixture failed to normalize`);
  return result.model;
}

/** mini.json: 4 findings, 2 flagged (abandoned + pinned), no advisories, exposure has one direct
 *  requirement (vendor/direct) that the abandoned transitive package's chain runs through. */
function loadMini(): Model {
  return loadFixture("mini.json");
}

/** A report with zero findings at all — the M20 "clean report" case: every filterable view's
 *  population is empty, so the search box and hint hide, but the count line still reads "0 of 0". */
function loadEmpty(): Model {
  return loadFixture("empty-lockrot-self.json");
}

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
        now: new Date(model.report.generatedAt),
        wide: true,
        openGlossary: vi.fn(),
        openGlossaryFrom: vi.fn(),
      }}
    >
      {ui}
    </ReportContext.Provider>,
  );
}

describe("SearchBar", () => {
  it("renders the search box with the legacy placeholder and an accessible label", () => {
    // Arrange
    const model = loadMini();
    const ref = createRef<HTMLInputElement>();

    // Act
    renderIn(<SearchBar inputRef={ref} />, model, INITIAL_STATE);

    // Assert
    const input = screen.getByRole("searchbox", { name: "Filter packages" });
    expect(input.getAttribute("placeholder")).toBe(
      "Filter: guzzle, verdict:left-behind, severity:critical, cve:CVE-2022-31090",
    );
  });

  it("dispatches a query action as the reader types", () => {
    // Arrange
    const model = loadMini();
    const dispatch = vi.fn();
    const ref = createRef<HTMLInputElement>();
    renderIn(<SearchBar inputRef={ref} />, model, INITIAL_STATE, dispatch);

    // Act
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "guzzle" } });

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "query", q: "guzzle" });
  });

  it("disables Clear with no query and no filter, and enables it once the query is non-blank", () => {
    // Arrange
    const model = loadMini();
    const ref = createRef<HTMLInputElement>();

    // Act
    renderIn(<SearchBar inputRef={ref} />, model, { ...INITIAL_STATE, q: "guzzle" });

    // Assert
    expect(screen.getByRole("button", { name: /clear/i }).hasAttribute("disabled")).toBe(false);
  });

  it("keeps Clear disabled for a whitespace-only query (critic.md M22's fix)", () => {
    // Arrange
    const model = loadMini();
    const ref = createRef<HTMLInputElement>();

    // Act
    renderIn(<SearchBar inputRef={ref} />, model, { ...INITIAL_STATE, q: "   " });

    // Assert
    expect(screen.getByRole("button", { name: /clear/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText(/filters? on/)).toBeNull();
  });

  it("dispatches clear when the Clear button is clicked", () => {
    // Arrange
    const model = loadMini();
    const dispatch = vi.fn();
    const ref = createRef<HTMLInputElement>();
    renderIn(<SearchBar inputRef={ref} />, model, { ...INITIAL_STATE, q: "guzzle" }, dispatch);

    // Act
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "clear" });
  });

  it("counts the findings tab the same way applyFilters would, singularising at one (M21)", () => {
    // Arrange
    const model = loadMini();
    const ref = createRef<HTMLInputElement>();

    // Act
    renderIn(<SearchBar inputRef={ref} />, model, INITIAL_STATE);

    // Assert: mini.json has 2 flagged findings and no active filter.
    expect(screen.getByRole("status").textContent).toContain("2 of 2 flagged packages");
  });

  it("narrows the count and shows the active-filter suffix once a rail filter is selected", () => {
    // Arrange
    const model = loadMini();
    const ref = createRef<HTMLInputElement>();
    const state: State = { ...INITIAL_STATE, filters: { ...INITIAL_STATE.filters, prio: ["critical"] } };

    // Act
    renderIn(<SearchBar inputRef={ref} />, model, state);

    // Assert: no flagged finding has priority "critical" in mini.json.
    const line = screen.getByRole("status").textContent;
    expect(line).toContain("0 of 2 flagged packages");
    expect(line).toContain("1 filter on");
  });

  it("counts the packages tab against every package, not just the flagged ones", () => {
    // Arrange
    const model = loadMini();
    const ref = createRef<HTMLInputElement>();

    // Act
    renderIn(<SearchBar inputRef={ref} />, model, { ...INITIAL_STATE, view: "packages" });

    // Assert: mini.json has 4 findings total.
    expect(screen.getByRole("status").textContent).toContain("4 of 4 packages");
  });

  it("counts the radius tab against the document's own direct-requirement count", () => {
    // Arrange
    const model = loadMini();
    const ref = createRef<HTMLInputElement>();

    // Act
    renderIn(<SearchBar inputRef={ref} />, model, { ...INITIAL_STATE, view: "radius" });

    // Assert: mini.json's one exposure entry (vendor/direct) pulls in the abandoned transitive
    // package, so it earns a card — singular, per M21.
    expect(screen.getByRole("status").textContent).toContain("1 of 1 direct requirement");
  });

  it("hides the search box and hint, but keeps the count line, on a clean report (critic.md M20)", () => {
    // Arrange
    const model = loadEmpty();
    const ref = createRef<HTMLInputElement>();

    // Act
    renderIn(<SearchBar inputRef={ref} />, model, INITIAL_STATE);

    // Assert
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("0 of 0 flagged packages");
  });

  it("shows nothing at all on the Run tab, which has no count to give", () => {
    // Arrange
    const model = loadMini();
    const ref = createRef<HTMLInputElement>();

    // Act
    const { container } = renderIn(<SearchBar inputRef={ref} />, model, { ...INITIAL_STATE, view: "run" });

    // Assert
    expect(container.textContent).toBe("");
  });
});
