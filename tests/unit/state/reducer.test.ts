import { describe, expect, it } from "vitest";
import { reducer } from "../../../src/state/reducer";
import { EMPTY_FILTERS, INITIAL_STATE } from "../../../src/state/types";
import type { State } from "../../../src/state/types";

describe("reducer / view", () => {
  it("switches the active tab and closes an open detail pane", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, view: "findings", pkg: "acme/widget" };

    // Act
    const next = reducer(state, { type: "view", view: "packages" });

    // Assert
    expect(next.view).toBe("packages");
    expect(next.pkg).toBeNull();
  });

  it("keeps the open detail pane when keepDetail is set, as data-goto does", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, view: "findings", pkg: "acme/widget" };

    // Act
    const next = reducer(state, { type: "view", view: "advisories", keepDetail: true });

    // Assert
    expect(next.view).toBe("advisories");
    expect(next.pkg).toBe("acme/widget");
  });

  it("does not mutate the original state object", () => {
    // Arrange
    const state = INITIAL_STATE;

    // Act
    reducer(state, { type: "view", view: "radius" });

    // Assert
    expect(state.view).toBe("findings");
  });
});

describe("reducer / toggle", () => {
  it("adds a key to an empty filter group", () => {
    // Arrange
    const state = INITIAL_STATE;

    // Act
    const next = reducer(state, { type: "toggle", group: "prio", key: "high" });

    // Assert
    expect(next.filters.prio).toEqual(["high"]);
  });

  it("removes a key that is already selected", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, prio: ["high"] } };

    // Act
    const next = reducer(state, { type: "toggle", group: "prio", key: "high" });

    // Assert
    expect(next.filters.prio).toEqual([]);
  });

  it("keeps selection order when a second key is added", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, prio: ["high"] } };

    // Act
    const next = reducer(state, { type: "toggle", group: "prio", key: "critical" });

    // Assert
    expect(next.filters.prio).toEqual(["high", "critical"]);
  });

  it("removing the first of two selected keys keeps the second, in order", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, prio: ["high", "critical"] } };

    // Act
    const next = reducer(state, { type: "toggle", group: "prio", key: "high" });

    // Assert
    expect(next.filters.prio).toEqual(["critical"]);
  });

  it("leaves other filter groups untouched", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, verdict: ["stale"] } };

    // Act
    const next = reducer(state, { type: "toggle", group: "prio", key: "high" });

    // Assert
    expect(next.filters.verdict).toEqual(["stale"]);
  });
});

describe("reducer / clear", () => {
  it("resets the query and every filter group, and nothing else", () => {
    // Arrange
    const state: State = {
      ...INITIAL_STATE,
      q: "left-pad",
      view: "packages",
      pkg: "acme/widget",
      sort: "libyears",
      sortDesc: true,
      filters: { ...EMPTY_FILTERS, prio: ["high"], verdict: ["stale"] },
    };

    // Act
    const next = reducer(state, { type: "clear" });

    // Assert
    expect(next.q).toBe("");
    expect(next.filters).toEqual(EMPTY_FILTERS);
    expect(next.view).toBe("packages");
    expect(next.pkg).toBe("acme/widget");
    expect(next.sort).toBe("libyears");
    expect(next.sortDesc).toBe(true);
  });
});

describe("reducer / sort", () => {
  it("toggles direction when the same column is clicked again", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, sort: "package", sortDesc: false };

    // Act
    const next = reducer(state, { type: "sort", key: "package" });

    // Assert
    expect(next.sort).toBe("package");
    expect(next.sortDesc).toBe(true);
  });

  it("flips back to ascending on a third click of the same column", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, sort: "package", sortDesc: true };

    // Act
    const next = reducer(state, { type: "sort", key: "package" });

    // Assert
    expect(next.sortDesc).toBe(false);
  });

  it("switching to a different column always resets to ascending", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, sort: "package", sortDesc: true };

    // Act
    const next = reducer(state, { type: "sort", key: "version" });

    // Assert
    expect(next.sort).toBe("version");
    expect(next.sortDesc).toBe(false);
  });
});

describe("reducer / select", () => {
  it("select opens the package and changes nothing else", () => {
    // Arrange
    const state = INITIAL_STATE;

    // Act
    const next = reducer(state, { type: "select", pkg: "acme/widget" });

    // Assert
    expect(next).toEqual({ ...INITIAL_STATE, pkg: "acme/widget" });
  });

  it("select with null closes the detail pane", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, pkg: "acme/widget" };

    // Act
    const next = reducer(state, { type: "select", pkg: null });

    // Assert
    expect(next.pkg).toBeNull();
  });
});

describe("reducer / restore", () => {
  it("replaces the whole state with the one carried by the action", () => {
    // Arrange
    const state = INITIAL_STATE;
    const restored: State = {
      ...INITIAL_STATE,
      view: "run",
      q: "abc",
      filters: { ...EMPTY_FILTERS, sev: ["critical"] },
    };

    // Act
    const next = reducer(state, { type: "restore", state: restored });

    // Assert
    expect(next).toBe(restored);
  });
});

// PD-BASELINE-6: one press that lists a set counted elsewhere on the page.
describe("reducer / focus", () => {
  it("opens Findings with exactly the given filters, the query emptied and no detail open", () => {
    // Arrange
    const state: State = {
      ...INITIAL_STATE,
      view: "run",
      q: "guzzle",
      pkg: "acme/widget",
      filters: { ...EMPTY_FILTERS, scope: ["dev"] },
      sort: "package",
      sortDesc: true,
    };
    const filters = { ...EMPTY_FILTERS, prio: ["critical", "high"], since: ["new", "worsened"] };

    // Act
    const next = reducer(state, { type: "focus", filters });

    // Assert
    expect(next).toEqual({ ...state, view: "findings", q: "", pkg: null, filters });
    expect(state.view).toBe("run");
  });
});
