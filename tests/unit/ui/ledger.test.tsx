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

// koel_koel.json: 202 packages, priorities {critical:1, high:3, medium:1, low:2}, verdicts
// left-behind 3, stale 3, silent 1 (flagged) and unknown 1, finished 23, ok 171; libyears 89.59
// total, 28.03 from direct requirements, furthest behind predis/predis v1.1.10 at 4.7.

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

/** A single flagged finding — none of this task's three fixtures (mini/koel_koel/mautic_mautic) has
 *  exactly one, and the eyebrow's own singular/plural choice (regression review) needs exactly that. */
function loadWithOneFlagged(): Model {
  const raw = {
    report: {
      generated_at: "2026-01-01T00:00:00Z",
      counts: {},
      priorities: {},
      exposure: [],
      findings: [
        {
          package: "acme/solo",
          version: "1.0.0",
          verdict: "abandoned",
          priority: "high",
          direct: true,
          dev: false,
          signals: [],
        },
      ],
    },
    details: {},
  };
  const result = normalize(raw);
  if (!result.ok) throw new Error("synthetic single-finding fixture failed to normalize");
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
        openGlossary: vi.fn(),
        openGlossaryFrom: vi.fn(),
      }}
    >
      {ui}
    </ReportContext.Provider>,
  );
}

describe("PriorityLedger (the summary band's lead)", () => {
  it("always shows all four non-none priorities, including one at zero, dimmed", () => {
    // Arrange
    const model = loadMini();

    // Act
    renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert: mini.json has critical:0, high:1, medium:1, low:0 — all four still get a chip, and
    // the accessible name stays "label count", the order the e2e suite clicks by.
    expect(screen.getByRole("button", { name: "critical 0" }).className).toContain("legend-btn-dim");
    expect(screen.getByRole("button", { name: "high 1" }).className).not.toContain("legend-btn-dim");
    expect(screen.getByRole("button", { name: "low 0" })).toBeTruthy();
  });

  it("leads with the flagged figure out of the packages checked, and its share of the lock", () => {
    // Arrange
    const model = loadFixture("koel_koel.json");

    // Act
    const { container } = renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert
    expect(container.querySelector(".lead-num")?.textContent).toBe("7");
    expect(screen.getByText("of 202 packages")).toBeTruthy();
    expect(container.querySelector(".lead-of")?.textContent).toContain("flagged · 3% of the lock");
  });

  it("gives the eyebrow a tooltip that matches the flagged count it labels (critic.md M29)", () => {
    // Arrange
    const model = loadMini();

    // Act
    const { container } = renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert: flagged excludes ok, finished AND unknown (mini.json has one of each).
    const eyebrow = screen.getByText("Flagged packages");
    expect(eyebrow.getAttribute("title")).toBe("Every verdict except ok, finished and unknown");
    expect(container.querySelector(".lead-num")?.textContent).toBe("2");
  });

  it("singularises 'package' for a lock of exactly one (regression review)", () => {
    // Arrange
    const model = loadWithOneFlagged();

    // Act
    renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert
    expect(screen.getByText("of 1 package")).toBeTruthy();
  });

  it("dispatches a prio toggle when a chip is clicked", () => {
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

  it("keeps an unknown priority's chip rather than dropping it (DESIGN.md §2)", () => {
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

  it("never shows a chip for the 'none' bucket, however large", () => {
    // Arrange
    const model = loadMini();
    const withNone: Model = {
      ...model,
      report: { ...model.report, priorities: { ...model.report.priorities, none: 999 } },
    };

    // Act
    const { container } = renderIn(<PriorityLedger />, withNone, INITIAL_STATE);

    // Assert
    expect(screen.queryByRole("button", { name: /^none/ })).toBeNull();
    expect(container.textContent).not.toContain("999");
  });

  it("draws one hidden square per package, the flagged ones first in their priority's tone", () => {
    // Arrange
    const model = loadFixture("koel_koel.json");

    // Act
    const { container } = renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert: 7 flagged (1 critical, 3 high, 1 medium, 2 low), then 195 quiet squares.
    const waffle = container.querySelector(".waffle");
    expect(waffle?.getAttribute("aria-hidden")).toBe("true");
    const cells = [...(waffle?.querySelectorAll(".waffle-cell") ?? [])];
    expect(cells).toHaveLength(202);
    expect(cells.slice(0, 7).map((cell) => cell.className.replace("waffle-cell ", ""))).toEqual([
      "tone-crit",
      "tone-high",
      "tone-high",
      "tone-high",
      "tone-med",
      "tone-low",
      "tone-low",
    ]);
    expect(cells.slice(7).every((cell) => cell.classList.contains("waffle-rest"))).toBe(true);
    // Rows are numbers through the CSSOM, never a style string (DESIGN.md §1.3): 202 squares are
    // 6 rows at the 38-column budget, 5 at the 50-column one.
    expect((waffle as HTMLElement).style.getPropertyValue("--rows-wide")).toBe("6");
    expect((waffle as HTMLElement).style.getPropertyValue("--rows-xwide")).toBe("5");
  });

  it("fills the last partial column from the top, with no blank slots before it", () => {
    // Arrange: koel_koel's 202 squares leave a partial last column at every width.
    const model = loadFixture("koel_koel.json");

    // Act
    const { container } = renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert: every child is a square, in order, so the grid's column-major flow ends at the top
    // of the last column rather than leaving a lone square in the bottom-right corner.
    const waffle = container.querySelector(".waffle") as HTMLElement;
    expect(waffle.children).toHaveLength(202);
    expect([...waffle.children].every((child) => child.classList.contains("waffle-cell"))).toBe(true);
  });

  it("draws a small lock's waffle too, as one short row", () => {
    // Arrange: mini.json checks 4.
    const model = loadMini();

    // Act
    const { container } = renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert
    const waffle = container.querySelector(".waffle") as HTMLElement;
    expect(waffle.querySelectorAll(".waffle-cell")).toHaveLength(4);
    expect(waffle.style.getPropertyValue("--rows-xwide")).toBe("1");
  });

  it("says nothing was flagged, in the none tone, for a clean report", () => {
    // Arrange: mini-split.json — one `ok` finding, priorities all 0 except none, packagesChecked 1.
    const model = loadFixture("mini-split.json");

    // Act
    const { container } = renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert
    expect(screen.getByText("Nothing flagged in 1 package").className).toContain("tone-none");
    expect(container.querySelector(".lead-num")).toBeNull();
  });

  it("says a lock with no packages has none, without the all-clear tone or a waffle", () => {
    // Arrange: empty-lockrot-self.json — 0 packages, every priority 0.
    const model = loadFixture("empty-lockrot-self.json");

    // Act
    const { container } = renderIn(<PriorityLedger />, model, INITIAL_STATE);

    // Assert: "nothing flagged in 0 packages" read as a clean bill of health for nothing at all.
    const line = screen.getByText("No packages in this lock");
    expect(line.className).not.toContain("tone-none");
    expect(container.querySelector(".clean-mark")).toBeNull();
    expect(container.querySelector(".waffle")).toBeNull();
    expect(screen.queryByText(/nothing flagged/i)).toBeNull();
    // Four disabled "0" chips had nothing to filter: an empty lock shows none.
    expect(container.querySelector(".lead-chips")).toBeNull();
  });

  it("falls back to findings.length when packagesChecked is null (an older document)", () => {
    // Arrange
    const model = loadMini();
    const withoutPackagesChecked: Model = {
      ...model,
      report: { ...model.report, packagesChecked: null },
    };

    // Act
    renderIn(<PriorityLedger />, withoutPackagesChecked, INITIAL_STATE);

    // Assert
    expect(screen.getByText(`of ${model.report.findings.length} packages`)).toBeTruthy();
  });
});

describe("VerdictLedger", () => {
  it("ranks the flagged verdicts as bars, most common first, and lists the rest as quiet chips", () => {
    // Arrange
    const model = loadFixture("koel_koel.json");

    // Act
    const { container } = renderIn(<VerdictLedger />, model, INITIAL_STATE);

    // Assert: the tie (left-behind 3, stale 3) keeps verdict order.
    const bars = [...container.querySelectorAll(".legend-btn-bar")].map((bar) => bar.textContent);
    expect(bars).toEqual(["left-behind 3", "stale 3", "silent 1"]);
    const quiet = [...container.querySelectorAll(".ledger-quiet .legend-btn")].map(
      (chip) => chip.textContent,
    );
    expect(quiet).toEqual(["unknown 1", "finished 23", "ok 171"]);
    expect(screen.getByText(/why the 7 are flagged/i)).toBeTruthy();
    // The bars are split in the chips' priority tones, and the header says so in words.
    expect(container.querySelector(".ledger-head-note")?.textContent).toBe(
      "most common first, split by priority",
    );
  });

  it("splits each bar by its packages' priorities, in the priority tones, scaled to the longest", () => {
    // Arrange: koel_koel's stale 3 are one medium and two low; its silent 1 is critical.
    const model = loadFixture("koel_koel.json");

    // Act
    const { container } = renderIn(<VerdictLedger />, model, INITIAL_STATE);

    // Assert: the row itself carries no tone — a colour here always means a priority.
    const stale = screen.getByRole("button", { name: "stale 3" });
    expect(stale.className).not.toMatch(/tone-/);
    const parts = [...stale.querySelectorAll(".legend-seg")] as HTMLElement[];
    expect(parts.map((part) => [part.className, part.style.flexGrow])).toEqual([
      ["legend-seg tone-med", "1"],
      ["legend-seg tone-low", "2"],
    ]);
    const silent = screen.getByRole("button", { name: "silent 1" });
    expect((silent.querySelector(".legend-fill") as HTMLElement).style.width).toMatch(/^33\.3/);
    expect(silent.querySelector(".legend-track")?.getAttribute("aria-hidden")).toBe("true");
    // The track is only as long as the longest bar needs (ledger.css `--unit`).
    expect(
      (container.querySelector(".verdict-bars") as HTMLElement).style.getPropertyValue("--longest"),
    ).toBe("3");
  });

  it("draws the part of a count the findings do not account for in neutral ink, never a guessed priority", () => {
    // Arrange: the document's count says 5 stale, but only 3 stale findings are listed.
    const model = loadFixture("koel_koel.json");
    const withMore: Model = {
      ...model,
      report: { ...model.report, counts: { ...model.report.counts, stale: 5 } },
    };

    // Act
    renderIn(<VerdictLedger />, withMore, INITIAL_STATE);

    // Assert
    const rest = screen
      .getByRole("button", { name: "stale 5" })
      .querySelector(".legend-seg-rest") as HTMLElement;
    expect(rest.style.flexGrow).toBe("2");
    expect(rest.className).not.toMatch(/tone-/);
  });

  it("says there is nothing to rank on a clean report, above its quiet line", () => {
    // Arrange: mini-split.json — one `ok` finding, nothing flagged.
    const model = loadFixture("mini-split.json");

    // Act
    renderIn(<VerdictLedger />, model, INITIAL_STATE);

    // Assert
    expect(screen.getByText("Nothing is flagged, so there is nothing to rank.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ok 1" })).toBeTruthy();
  });

  it("says why the column is empty for a lock with no packages", () => {
    // Arrange
    const model = loadFixture("empty-lockrot-self.json");

    // Act
    renderIn(<VerdictLedger />, model, INITIAL_STATE);

    // Assert
    expect(screen.getByText("No packages, so no verdicts.")).toBeTruthy();
  });

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

  it("dispatches a verdict toggle from a bar and from a quiet chip alike", () => {
    // Arrange
    const model = loadMini();
    const dispatch = vi.fn();
    renderIn(<VerdictLedger />, model, INITIAL_STATE, dispatch);

    // Act
    fireEvent.click(screen.getByRole("button", { name: /^abandoned/ }));
    fireEvent.click(screen.getByRole("button", { name: /^finished/ }));

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle", group: "verdict", key: "abandoned" });
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle", group: "verdict", key: "finished" });
  });

  it("keeps an unknown verdict's chip rather than dropping it (DESIGN.md §2)", () => {
    // Arrange: a document from a future lockrot that adds a verdict this renderer does not know.
    const model = loadMini();
    const withRotten: Model = {
      ...model,
      report: { ...model.report, counts: { ...model.report.counts, rotten: 2 } },
    };

    // Act
    renderIn(<VerdictLedger />, withRotten, INITIAL_STATE);

    // Assert: the run does not flag it, so a quiet chip at a neutral ("low") tone.
    const button = screen.getByRole("button", { name: /^rotten/ });
    expect(button.textContent).toContain("2");
    expect(button.className).toContain("tone-low");
    expect(button.className).not.toContain("legend-btn-bar");
  });
});

describe("AdvisoryLedger", () => {
  it("says the lock is clear once, in the green all-clear tone, with no mark to caption", () => {
    // Arrange: mini.json's network_failures is false and its notes name neither the advisory nor
    // the audit check (PD-LEDGER-1, DESIGN.md §5) — the clean case.
    const model = loadMini();

    // Act
    const { container } = renderIn(<AdvisoryLedger />, model, INITIAL_STATE);

    // Assert
    const line = screen.getByText("No advisory affects this lock").closest("p");
    expect(line?.className).toContain("tone-none");
    expect(screen.getAllByText(/no advisory affects this lock/i)).toHaveLength(1);
    expect(container.querySelector(".advisory-square")).toBeNull();
    expect(screen.queryByRole("button", { name: /^critical/ })).toBeNull();
  });

  it("says the check may be incomplete, in a neutral tone, when the run's own data says so (PD-LEDGER-1)", () => {
    // Arrange: mini-advisory-incomplete.json — network_failures true, a note naming the advisory
    // check, zero advisories in the document.
    const model = loadFixture("mini-advisory-incomplete.json");

    // Act
    renderIn(<AdvisoryLedger />, model, INITIAL_STATE);

    // Assert: neither says the lock is clean nor stays silent about why there is nothing to show.
    expect(screen.queryByText(/no advisory affects this lock/i)).toBeNull();
    const line = screen.getByText("No advisory found; 2 packages could not be confirmed clear");
    expect(line.className).toContain("tone-low");
    expect(line.className).not.toContain("tone-none");
    expect(screen.getByText(/under run data/i)).toBeTruthy();
  });

  it("draws one square per advisory and a chip per severity, skipping empty severities", () => {
    // Arrange
    const model = loadWithAdvisories();

    // Act
    const { container } = renderIn(<AdvisoryLedger />, model, INITIAL_STATE);

    // Assert: two criticals, one medium, nothing high/low/unrated.
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("advisories on 2 packages")).toBeTruthy();
    const squares = [...container.querySelectorAll(".advisory-square")].map((sq) => sq.className);
    expect(squares).toEqual([
      "advisory-square tone-crit",
      "advisory-square tone-crit",
      "advisory-square tone-med",
    ]);
    expect(container.querySelector(".advisory-squares")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: /^critical/ }).textContent).toContain("2");
    expect(screen.getByRole("button", { name: /^medium/ }).textContent).toContain("1");
    expect(screen.queryByRole("button", { name: /^high/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^unrated/ })).toBeNull();
  });

  it("names each package with its advisories' own fix versions, verbatim", () => {
    // Arrange
    const model = loadWithAdvisories();

    // Act
    const { container } = renderIn(<AdvisoryLedger />, model, INITIAL_STATE);

    // Assert
    const lines = [...container.querySelectorAll(".advisory-packages p")].map((line) => line.textContent);
    expect(lines).toEqual(["acme/one — fixed by 1.0.1; some list no fix", "acme/two — no fix listed"]);
  });

  it("opens a named package's detail", () => {
    // Arrange
    const model = loadWithAdvisories();
    const dispatch = vi.fn();
    renderIn(<AdvisoryLedger />, model, INITIAL_STATE, dispatch);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "acme/two" }));

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "acme/two" });
  });

  it("dispatches a sev toggle when a severity chip is clicked", () => {
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
    const { container } = renderIn(<LibyearsLedger />, model, INITIAL_STATE);

    // Assert: mini.json's libyears.measured is 0, across 4 total (0 + 4 unmeasured) packages.
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("None of the 4 packages could be measured.")).toBeTruthy();
    expect(container.querySelector(".libyears-bar")).toBeNull();
  });

  it("explains the dash for a document with no libyears block at all", () => {
    // Arrange: mini-advisory-incomplete.json carries no libyears block.
    const model = loadFixture("mini-advisory-incomplete.json");

    // Act
    renderIn(<LibyearsLedger />, model, INITIAL_STATE);

    // Assert
    expect(model.report.libyears).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("This run did not report libyears.")).toBeTruthy();
  });

  it("splits the figure into direct requirements and what they pull in", () => {
    // Arrange
    const model = loadFixture("koel_koel.json");

    // Act
    const { container } = renderIn(<LibyearsLedger />, model, INITIAL_STATE);

    // Assert: 89.59 total, 28.03 direct, 61.56 pulled in.
    expect(container.querySelector(".ledger-fig-num")?.textContent).toBe("89.6");
    expect(container.querySelector(".libyears-parts")?.textContent).toBe(
      "28.0 your direct requirements61.6 pulled in by them",
    );
    expect(container.querySelector(".libyears-bar")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".ledger-note")?.textContent).toBe(
      "Across 196 of 202 packages. Furthest behind: predis/predis v1.1.10 at 4.7.",
    );
  });

  it("opens the furthest-behind package's detail", () => {
    // Arrange
    const model = loadFixture("koel_koel.json");
    const dispatch = vi.fn();
    renderIn(<LibyearsLedger />, model, INITIAL_STATE, dispatch);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "predis/predis" }));

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "predis/predis" });
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

  it("renders the lead and its three supporting columns on a filterable tab", () => {
    // Arrange
    const model = loadMini();

    // Act
    const { container } = renderIn(<Ledger />, model, INITIAL_STATE);

    // Assert
    expect(screen.getByRole("group", { name: "Ledger" })).toBeTruthy();
    expect(screen.getByText("Flagged packages")).toBeTruthy();
    expect(screen.getByText(/why the 2 are flagged/i)).toBeTruthy();
    expect(screen.getByText("Security advisories")).toBeTruthy();
    expect(screen.getByText("Libyears")).toBeTruthy();
    expect(container.querySelector("details")).toBeNull();
  });

  it("on a phone, folds only the supporting columns, behind a line that counts them", () => {
    // Arrange
    const model = loadFixture("koel_koel.json");

    // Act
    const { container } = renderIn(<Ledger narrow />, model, INITIAL_STATE);

    // Assert: the lead (figure and chips) sits outside the fold, the tier inside it.
    const fold = container.querySelector("details.ledger-fold");
    expect(fold).not.toBeNull();
    expect(fold?.querySelector(".ledger-lead")).toBeNull();
    expect(fold?.querySelector(".ledger-tier")).not.toBeNull();
    expect(container.querySelector(".ledger-lead")?.closest("details")).toBeNull();
    expect(fold?.querySelector("summary")?.textContent).toBe(
      "More about this lock3 reasons · no advisories · 89.6 libyears",
    );
  });
});
