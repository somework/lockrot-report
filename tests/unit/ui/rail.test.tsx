import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import type { ComponentChild } from "preact";
import type { Action, State } from "../../../src/state/types";
import { INITIAL_STATE } from "../../../src/state/types";
import type { Model } from "../../../src/model/types";
import { normalize } from "../../../src/model/normalize";
import { ReportContext } from "../../../src/ui/context";
import { Rail } from "../../../src/ui/rail/Rail";

afterEach(cleanup);

// mini.json (fixtures/bundles/): 2 flagged findings (vendor/transitive: abandoned, transitive,
// signals S1+S5; vendor/snapshot: pinned, transitive, signals S5+S6). No baseline, no advisories,
// so the Findings tab's rail has Scope and Signal groups only — Since and "What the fix costs" are
// both omitted, per railGroups()'s own gating.
function loadMini(): Model {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", "mini.json"), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error("mini.json fixture failed to normalize");
  return result.model;
}

/** A hand-built bundle with a baseline and an S9 advisory, so the Since and "What the fix costs"
 *  groups have something to render — none of this task's three named fixtures carry either. */
function loadWithBaselineAndAdvisory(): Model {
  const raw = {
    report: {
      generated_at: "2026-01-01T00:00:00Z",
      counts: {},
      priorities: {},
      exposure: [],
      baseline: { path: "baseline.json", known: 1, new: 1, worsened: 0, stale: [] },
      findings: [
        {
          package: "acme/new",
          version: "1.0.0",
          verdict: "stale",
          priority: "medium",
          direct: true,
          dev: false,
          baseline: { status: "new" },
          signals: [
            {
              id: "S9",
              level: "high",
              summary: "1 advisory",
              data: { advisories: [{ id: "GHSA-1", severity: "high", fixed_by: null }] },
            },
          ],
        },
        {
          package: "acme/known",
          version: "1.0.0",
          verdict: "silent",
          priority: "critical",
          direct: false,
          dev: false,
          baseline: { status: "known" },
          signals: [],
        },
      ],
    },
    details: {},
  };
  const result = normalize(raw);
  if (!result.ok) throw new Error("synthetic baseline fixture failed to normalize");
  return result.model;
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
        cursor: null,
        openGlossary: vi.fn(),
        openGlossaryFrom: vi.fn(),
      }}
    >
      {ui}
    </ReportContext.Provider>,
  );
}

describe("Rail", () => {
  it("renders nothing when the current tab has no population to filter", () => {
    // Arrange
    const model = loadMini();
    const state: State = { ...INITIAL_STATE, view: "run" };

    // Act
    const { container } = renderIn(<Rail />, model, state);

    // Assert
    expect(container.textContent).toBe("");
  });

  it("renders the Scope group with the legacy labels and per-tab counts", () => {
    // Arrange
    const model = loadMini();

    // Act
    renderIn(<Rail />, model, INITIAL_STATE);

    // Assert: both flagged findings are transitive and require (not dev).
    expect(screen.getByRole("button", { name: /^Direct /i }).textContent).toContain("0");
    expect(screen.getByRole("button", { name: /^Transitive /i }).textContent).toContain("2");
    expect(screen.getByRole("button", { name: /^require /i }).textContent).toContain("2");
    expect(screen.getByRole("button", { name: /^require-dev /i }).textContent).toContain("0");
  });

  it("renders a Signal group with numeric id order, and omits Since/fix groups with nothing to show", () => {
    // Arrange
    const model = loadMini();

    // Act
    renderIn(<Rail />, model, INITIAL_STATE);

    // Assert
    expect(screen.getByRole("button", { name: /S1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /S5/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /S6/ })).toBeTruthy();
    expect(screen.queryByText(/^Since /)).toBeNull();
    expect(screen.queryByText("What the fix costs")).toBeNull();
  });

  it("dispatches a scope toggle when a rail button is clicked", () => {
    // Arrange
    const model = loadMini();
    const dispatch = vi.fn();
    renderIn(<Rail />, model, INITIAL_STATE, dispatch);

    // Act
    fireEvent.click(screen.getByRole("button", { name: /^Direct /i }));

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle", group: "scope", key: "direct" });
  });

  it("marks a selected scope option pressed", () => {
    // Arrange
    const model = loadMini();
    const state: State = { ...INITIAL_STATE, filters: { ...INITIAL_STATE.filters, scope: ["transitive"] } };

    // Act
    renderIn(<Rail />, model, state);

    // Assert
    expect(screen.getByRole("button", { name: /^Transitive /i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Direct /i }).getAttribute("aria-pressed")).toBe("false");
  });

  it("renders the Since group, titled with the baseline's own path, once a baseline exists", () => {
    // Arrange
    const model = loadWithBaselineAndAdvisory();

    // Act
    renderIn(<Rail />, model, INITIAL_STATE);

    // Assert
    expect(screen.getByText("Since baseline.json")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^New /i }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: /^Already accepted /i }).textContent).toContain("1");
  });

  it("renders the fix-cost group once an advisory has a fix shape to report", () => {
    // Arrange
    const model = loadWithBaselineAndAdvisory();

    // Act
    renderIn(<Rail />, model, INITIAL_STATE);

    // Assert: the one advisory has no fixed_by at all, so it falls in "No fix listed".
    expect(screen.getByRole("button", { name: /^No fix listed /i }).textContent).toContain("1");
  });
});
