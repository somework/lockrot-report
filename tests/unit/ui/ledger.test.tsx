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
import { Ledger } from "../../../src/ui/ledger/Ledger";
import { PriorityLedger } from "../../../src/ui/ledger/PriorityLedger";
import { VerdictLedger } from "../../../src/ui/ledger/VerdictLedger";
import { AdvisoryLedger } from "../../../src/ui/ledger/AdvisoryLedger";
import { LibyearsLedger } from "../../../src/ui/ledger/LibyearsLedger";
import { SummaryBand, SummaryCounts } from "../../../src/ui/ledger/SummaryBand";

afterEach(cleanup);

/** Loaded through normalize() exactly as the model/normalize.test.ts suite does, since this
 *  component tree is written against `Model`, never against the wire document. */
function loadFixture(name: string): Model {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "bundles", name), "utf8")) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`${name} fixture failed to normalize`);
  return result.model;
}

// mini.json: 4 findings, 2 flagged (1 abandoned, 1 pinned), no advisories, no baseline, priorities
// {critical:0, high:1, medium:1, low:0, none:2}, packagesChecked 4.
function loadMini(): Model {
  return loadFixture("mini.json");
}

/** A hand-built bundle normalize() can turn into a model with advisories — none of the three
 *  fixtures this task names (mini/koel_koel/mautic_mautic) carry any S9 signal at all, and the
 *  AdvisoryLedger's non-empty path needs one to exercise its skip-zero behaviour. */
function loadWithAdvisories(): Model {
  const raw = {
    report: {
      generated_at: "2026-01-01T00:00:00Z",
      counts: {},
      priorities: {},
      exposure: [],
      findings: [
        {
          package: "acme/one",
          version: "1.0.0",
          verdict: "stale",
          priority: "medium",
          direct: true,
          dev: false,
          signals: [
            {
              id: "S9",
              level: "high",
              summary: "2 advisories",
              data: {
                advisories: [
                  { id: "GHSA-1", severity: "critical", fixed_by: "1.0.1", fixed_on_branch: true },
                  { id: "GHSA-2", severity: "medium", fixed_by: null },
                ],
              },
            },
          ],
        },
        {
          package: "acme/two",
          version: "2.0.0",
          verdict: "ok",
          priority: "none",
          direct: true,
          dev: false,
          signals: [
            {
              id: "S9",
              level: "warn",
              summary: "1 advisory",
              data: { advisories: [{ id: "GHSA-3", severity: "critical", fixed_by: null }] },
            },
          ],
        },
      ],
    },
    details: {},
  };
  const result = normalize(raw);
  if (!result.ok) throw new Error("synthetic advisory fixture failed to normalize");
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
      value={{ model, state, dispatch, now: new Date(model.report.generatedAt), wide: true }}
    >
      {ui}
    </ReportContext.Provider>,
  );
}

describe("PriorityLedger", () => {
  it("always shows all four non-none priorities, including one at zero", () => {
    // Arrange
    const model = loadMini();

    // Act
    renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert: mini.json has critical:0, high:1, medium:1, low:0 — all four still get a button.
    expect(screen.getByRole("button", { name: /^critical/ }).textContent).toContain("0");
    expect(screen.getByRole("button", { name: /^high/ }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: /^low/ }).textContent).toContain("0");
  });

  it("gives the eyebrow a tooltip that matches the flagged count it labels (critic.md M29)", () => {
    // Arrange
    const model = loadMini();

    // Act
    renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert: flagged excludes ok, finished AND unknown (mini.json has one of each) — the tooltip
    // has to say so, unlike legacy's "except ok and finished" which under-counts.
    const eyebrow = screen.getByText(/priority of the/i);
    expect(eyebrow.getAttribute("title")).toBe("Every verdict except ok, finished and unknown");
    expect(eyebrow.textContent).toContain("2");
  });

  it("dispatches a prio toggle when a legend button is clicked", () => {
    // Arrange
    const model = loadMini();
    const dispatch = vi.fn();
    renderIn(<PriorityLedger />, model, INITIAL_STATE, dispatch);

    // Act
    fireEvent.click(screen.getByRole("button", { name: /^high/ }));

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle", group: "prio", key: "high" });
  });

  it("marks a selected priority pressed", () => {
    // Arrange
    const model = loadMini();
    const state: State = { ...INITIAL_STATE, filters: { ...INITIAL_STATE.filters, prio: ["high"] } };

    // Act
    renderIn(<PriorityLedger />, model, state);

    // Assert
    expect(screen.getByRole("button", { name: /^high/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^medium/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps an unknown priority's bar segment and legend button rather than dropping it (DESIGN.md §2)", () => {
    // Arrange: a document from a future lockrot that adds a priority this renderer does not know.
    const model = loadMini();
    const withUrgent: Model = {
      ...model,
      report: { ...model.report, priorities: { ...model.report.priorities, urgent: 1 } },
    };

    // Act
    renderIn(<PriorityLedger />, withUrgent, INITIAL_STATE);

    // Assert: shown after the four known priorities, at a neutral ("low") tone.
    const button = screen.getByRole("button", { name: /^urgent/ });
    expect(button.textContent).toContain("1");
    expect(button.className).toContain("tone-low");
  });

  it("never shows a bar segment or legend button for the 'none' bucket", () => {
    // Arrange: `none` is a package with no rot verdict at all — never a bar segment, per the four
    // named priorities' own doc comment.
    const model = loadMini();
    const withNone: Model = {
      ...model,
      report: { ...model.report, priorities: { ...model.report.priorities, none: 7 } },
    };

    // Act
    renderIn(<PriorityLedger />, withNone, INITIAL_STATE);

    // Assert
    expect(screen.queryByRole("button", { name: /^none/ })).toBeNull();
  });
});

describe("VerdictLedger", () => {
  it("skips a verdict with a zero count instead of showing it at zero", () => {
    // Arrange
    const model = loadMini();

    // Act
    renderIn(<VerdictLedger />, model, INITIAL_STATE);

    // Assert: mini.json's silent/left-behind/old-promise/stale/ok counts are all 0.
    expect(screen.queryByRole("button", { name: /^silent/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^ok/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^abandoned/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^pinned/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^unknown/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^finished/ })).toBeTruthy();
  });

  it("dispatches a verdict toggle when a legend button is clicked", () => {
    // Arrange
    const model = loadMini();
    const dispatch = vi.fn();
    renderIn(<VerdictLedger />, model, INITIAL_STATE, dispatch);

    // Act
    fireEvent.click(screen.getByRole("button", { name: /^abandoned/ }));

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle", group: "verdict", key: "abandoned" });
  });

  it("keeps an unknown verdict's bar segment and legend button rather than dropping it (DESIGN.md §2)", () => {
    // Arrange: a document from a future lockrot that adds a verdict this renderer does not know.
    const model = loadMini();
    const withRotten: Model = {
      ...model,
      report: { ...model.report, counts: { ...model.report.counts, rotten: 2 } },
    };

    // Act
    renderIn(<VerdictLedger />, withRotten, INITIAL_STATE);

    // Assert: shown after the known verdicts, at a neutral ("low") tone, not silently dropped.
    const button = screen.getByRole("button", { name: /^rotten/ });
    expect(button.textContent).toContain("2");
    expect(button.className).toContain("tone-low");
    fireEvent.click(button);
  });
});

describe("AdvisoryLedger", () => {
  it("shows the muted fallback when the document carries no advisories", () => {
    // Arrange
    const model = loadMini();

    // Act
    renderIn(<AdvisoryLedger />, model, INITIAL_STATE);

    // Assert: legacy shows the same message twice — the eyebrow (title case) and the legend
    // fallback (lower case, `report.js:278-291`) — so both are expected here.
    expect(screen.getAllByText(/no advisory affects this lock/i)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^critical/ })).toBeNull();
  });

  it("buckets advisories by severity, skipping a bucket with no advisory in it", () => {
    // Arrange
    const model = loadWithAdvisories();

    // Act
    renderIn(<AdvisoryLedger />, model, INITIAL_STATE);

    // Assert: two criticals, one medium, nothing high/low/unrated.
    expect(screen.getByRole("button", { name: /^critical/ }).textContent).toContain("2");
    expect(screen.getByRole("button", { name: /^medium/ }).textContent).toContain("1");
    expect(screen.queryByRole("button", { name: /^high/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^low/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^unrated/ })).toBeNull();
  });

  it("dispatches a sev toggle when a severity bucket is clicked", () => {
    // Arrange
    const model = loadWithAdvisories();
    const dispatch = vi.fn();
    renderIn(<AdvisoryLedger />, model, INITIAL_STATE, dispatch);

    // Act
    fireEvent.click(screen.getByRole("button", { name: /^critical/ }));

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle", group: "sev", key: "critical" });
  });
});

describe("LibyearsLedger", () => {
  it("reads a dash and explains why when nothing could be measured", () => {
    // Arrange
    const model = loadMini();

    // Act
    renderIn(<LibyearsLedger />, model, INITIAL_STATE);

    // Assert: mini.json's libyears.measured is 0, across 4 total (0 + 4 unmeasured) packages.
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("none of the 4 packages could be measured")).toBeTruthy();
  });
});

describe("Ledger", () => {
  it("renders nothing on the Run tab", () => {
    // Arrange
    const model = loadMini();
    const state: State = { ...INITIAL_STATE, view: "run" };

    // Act
    const { container } = renderIn(<Ledger />, model, state);

    // Assert
    expect(container.textContent).toBe("");
  });

  it("renders all four blocks on a filterable tab", () => {
    // Arrange
    const model = loadMini();

    // Act
    renderIn(<Ledger />, model, INITIAL_STATE);

    // Assert
    expect(screen.getByText(/priority of the/i)).toBeTruthy();
    expect(screen.getByText(/verdicts across/i)).toBeTruthy();
    expect(screen.getAllByText(/no advisory affects this lock/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Libyears behind")).toBeTruthy();
  });
});

describe("SummaryBand", () => {
  it("lists each non-zero, non-none priority in document order, then the package total", () => {
    // Arrange: mini.json's priorities {critical:0, high:1, medium:1, low:0, none:2}, packagesChecked 4.
    const model = loadMini();

    // Act
    const { container } = renderIn(<SummaryBand />, model, INITIAL_STATE);

    // Assert: critical and low are zero and dropped; none is never shown at all.
    expect(container.textContent).toBe("1 high · 1 medium of 4 packages");
    expect(container.querySelector(".summary-count.tone-high")?.textContent).toBe("1 high");
    // The dot before "medium" is that span's own child (the separator sits with the item it
    // introduces), so its textContent carries it too.
    expect(container.querySelector(".summary-count.tone-med")?.textContent).toBe(" · 1 medium");
  });

  it("says nothing was flagged, in the none tone, when every shown priority is zero", () => {
    // Arrange: mini-split.json — one `ok` finding, priorities all 0 except none, packagesChecked 1.
    const model = loadFixture("mini-split.json");

    // Act
    const { container, getByText } = renderIn(<SummaryBand />, model, INITIAL_STATE);

    // Assert: singular "package", and no per-priority counts at all.
    expect(getByText("Nothing flagged in 1 package").className).toContain("tone-none");
    expect(container.querySelector(".summary-count")).toBeNull();
  });

  it("keeps the plural even at a total of zero packages", () => {
    // Arrange: empty-lockrot-self.json — 0 packages, every priority 0.
    const model = loadFixture("empty-lockrot-self.json");

    // Act
    renderIn(<SummaryBand />, model, INITIAL_STATE);

    // Assert
    expect(screen.getByText("Nothing flagged in 0 packages")).toBeTruthy();
  });

  it("falls back to findings.length when packagesChecked is null (an older document)", () => {
    // Arrange
    const model = loadMini();
    const withoutPackagesChecked: Model = {
      ...model,
      report: { ...model.report, packagesChecked: null },
    };

    // Act
    const { container } = renderIn(<SummaryBand />, withoutPackagesChecked, INITIAL_STATE);

    // Assert: mini.json carries 4 findings, same number packagesChecked happened to be.
    expect(container.textContent).toContain(`of ${model.report.findings.length} packages`);
  });

  it("never renders a count for the none bucket, however large", () => {
    // Arrange: `none` is a package with no rot verdict at all, not a priority a reader filters on.
    const model = loadMini();
    const withNone: Model = {
      ...model,
      report: { ...model.report, priorities: { ...model.report.priorities, none: 999 } },
    };

    // Act
    const { container } = renderIn(<SummaryBand />, withNone, INITIAL_STATE);

    // Assert
    expect(container.textContent).not.toContain("999");
    expect(container.textContent).not.toContain("none");
  });

  it("wraps the same content SummaryCounts renders, for the phone fold's <summary> to reuse bare", () => {
    // Arrange
    const model = loadMini();

    // Act
    const band = renderIn(<SummaryBand />, model, INITIAL_STATE);
    const wrapped = band.container.querySelector("div.summary p.summary-counts");
    band.unmount();
    const bare = renderIn(<SummaryCounts />, model, INITIAL_STATE);

    // Assert
    expect(wrapped).toBeTruthy();
    expect(bare.container.textContent).toBe("1 high · 1 medium of 4 packages");
  });
});
