import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import type { ComponentChild } from "preact";

import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { INITIAL_STATE } from "../../../src/state/types";
import type { Action, State } from "../../../src/state/types";
import { ReportContext, type ReportContextValue } from "../../../src/ui/context";
import { CurrentView } from "../../../src/ui/views/Views";
import { FindingsView } from "../../../src/ui/views/FindingsView";
import { PackagesView } from "../../../src/ui/views/PackagesView";
import { AdvisoriesView } from "../../../src/ui/views/AdvisoriesView";
import { RadiusView } from "../../../src/ui/views/RadiusView";
import { RunView } from "../../../src/ui/views/RunView";
import { makeFinding, makeModel } from "../domain/fixtures";

afterEach(cleanup);

const FIXTURES_DIR = join(process.cwd(), "fixtures", "bundles");
const FLAGGED_VERDICTS = ["abandoned", "silent", "pinned", "left-behind", "old-promise", "stale"] as const;

function loadModel(name: string): Model {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`fixture ${name} failed to normalize: ${result.error.message}`);

  return result.model;
}

/** `makeModel` (tests/unit/domain/fixtures.ts) leaves `run.flaggedVerdicts` empty, since most
 *  domain/ tests that use it don't care which verdicts count as findings. Every view test that
 *  exercises a *flagged* row needs the real fallback list, or `isFlagged()` never lets one through. */
function flaggedModel(findings: Parameters<typeof makeModel>[0]): Model {
  const model = makeModel(findings);
  return {
    ...model,
    report: { ...model.report, run: { ...model.report.run, flaggedVerdicts: [...FLAGGED_VERDICTS] } },
  };
}

function renderIn(model: Model, state: State, ui: ComponentChild) {
  const dispatch = vi.fn<(action: Action) => void>();
  const value: ReportContextValue = {
    model,
    state,
    dispatch,
    now: new Date(model.report.generatedAt),
    wide: true,
  };
  const result = render(<ReportContext.Provider value={value}>{ui}</ReportContext.Provider>);
  return { ...result, dispatch };
}

function stateWith(overrides: Partial<State> = {}): State {
  return { ...INITIAL_STATE, ...overrides };
}

describe("CurrentView", () => {
  it("picks the view component matching state.view", () => {
    // Arrange
    const model = loadModel("mini.json");

    // Act
    renderIn(model, stateWith({ view: "run" }), <CurrentView />);

    // Assert: the Run tab's own section heading, not a Findings row.
    expect(screen.getByText("Thresholds in force")).toBeTruthy();
  });
});

describe("FindingsView", () => {
  it("groups mini.json's flagged findings by priority, each row named after its package", () => {
    // Arrange
    const model = loadModel("mini.json");

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert: vendor/transitive (high) and vendor/snapshot (medium) are the two flagged findings in
    // this fixture; vendor/direct (unknown) and private/thing (finished) are not findings at all.
    expect(screen.getByRole("listitem", { name: "vendor/transitive" })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "vendor/snapshot" })).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: "vendor/direct" })).toBeNull();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("medium")).toBeTruthy();
  });

  it("shows the clean-report message when nothing was flagged, never the filtered-out one", () => {
    // Arrange: every finding is healthy, so the Findings tab's own population is empty before any
    // filter runs at all (DESIGN.md §5 M20).
    const model = makeModel([makeFinding({ package: "healthy/pkg", verdict: "ok", priority: "none" })]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert
    expect(screen.getByText(/nothing was flagged/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("shows the filtered-out message with a Clear action when the query hides every flagged row", () => {
    // Arrange
    const model = flaggedModel([
      makeFinding({ package: "flagged/pkg", verdict: "abandoned", priority: "critical" }),
    ]);

    // Act
    renderIn(model, stateWith({ q: "no-such-package" }), <FindingsView />);

    // Assert
    expect(screen.getByText(/nothing matches this filter/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /clear/i })).toBeTruthy();
  });

  it("names the packages carrying an advisory but no rot verdict, above the list, regardless of the query", () => {
    // Arrange
    const quiet = makeFinding({
      package: "quiet/pkg",
      verdict: "ok",
      priority: "none",
      advisories: [
        {
          id: "GHSA-1",
          cve: null,
          title: null,
          link: null,
          severityRaw: null,
          severity: "unrated",
          reportedAt: null,
          affectedVersions: null,
          fixedBy: null,
          fixedOnBranch: false,
        },
      ],
    });
    const flagged = makeFinding({ package: "flagged/pkg", verdict: "abandoned", priority: "critical" });
    const model = flaggedModel([quiet, flagged]);

    // Act: a query that matches neither the quiet note's own text nor "flagged/pkg" still shows the
    // note (M27, kept as legacy) while the row list below it goes to its own filtered empty state.
    renderIn(model, stateWith({ q: "nothing-matches" }), <FindingsView />);

    // Assert
    expect(screen.getByRole("button", { name: "quiet/pkg" })).toBeTruthy();
    expect(screen.getByText(/security advisory but no rot/)).toBeTruthy();
    expect(screen.getByText(/nothing matches this filter/i)).toBeTruthy();
  });

  it("toggles selection on a row click, and does nothing when the click lands on a link", () => {
    // Arrange
    const finding = makeFinding({
      package: "signal/pkg",
      verdict: "abandoned",
      priority: "critical",
      signals: [{ id: "S1", level: "high", summary: "marked abandoned", data: {} }],
    });
    const model = flaggedModel([finding]);
    const { dispatch } = renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "signal/pkg" });

    // Act: click the signal-id link inside the row.
    fireEvent.click(within(row).getByRole("link", { name: "S1" }));

    // Assert: the row's own toggle handler never fires for a click that landed on an `<a>`.
    expect(dispatch).not.toHaveBeenCalled();

    // Act: click the row itself.
    fireEvent.click(row);

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "signal/pkg" });
  });

  it("closes the same package on a second click", () => {
    // Arrange
    const finding = makeFinding({ package: "open/pkg", verdict: "abandoned", priority: "critical" });
    const model = flaggedModel([finding]);
    const { dispatch } = renderIn(model, stateWith({ pkg: "open/pkg" }), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "open/pkg" });

    // Assert: already marked open per state.pkg
    expect(row.getAttribute("aria-current")).toBe("true");

    // Act
    fireEvent.click(row);

    // Assert: toggling the open package closes it (`pkg: null`).
    expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: null });
  });

  it("never attaches its own Enter/Space handling — that is ui/keyboard.ts's job, driven by data-pkg", () => {
    // Arrange: keyboard.ts's `keyInputFrom` walks up from the event target to the nearest
    // `[data-pkg]` ancestor and decides centrally (M5's link-vs-row distinction lives there, not per
    // row) — a row adding its own `onKeyDown` would just race that one document-level listener.
    const finding = makeFinding({ package: "any/pkg", verdict: "abandoned", priority: "critical" });
    const model = flaggedModel([finding]);
    const { dispatch } = renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "any/pkg" });

    // Act
    fireEvent.keyDown(row, { key: "Enter" });

    // Assert
    expect(dispatch).not.toHaveBeenCalled();
    expect(row.getAttribute("data-pkg")).toBe("any/pkg");
  });
});

describe("PackagesView", () => {
  it("lists every package, not only the flagged ones, as focusable and selectable rows", () => {
    // Arrange
    const model = loadModel("mini.json");

    // Act
    renderIn(model, stateWith({ view: "packages" }), <PackagesView />);

    // Assert: private/thing (finished) has no rot verdict but still belongs on this tab (M6: rows
    // are focusable, unlike legacy's plain `<tr>`).
    const row = screen.getByRole("row", { name: "private/thing" });
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute("aria-selected")).toBe("false");
  });

  it("dispatches a sort action naming the clicked column", () => {
    // Arrange
    const model = loadModel("mini.json");
    const { dispatch } = renderIn(model, stateWith({ view: "packages" }), <PackagesView />);

    // Act
    const header = screen.getByRole("columnheader", { name: /libyears/i });
    fireEvent.click(within(header).getByRole("button"));

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "sort", key: "libyears" });
  });
});

describe("AdvisoriesView", () => {
  it("renders wallabag's advisories as selectable rows naming their package", () => {
    // Arrange
    const model = loadModel("wallabag_wallabag.json");

    // Act
    renderIn(model, stateWith({ view: "advisories" }), <AdvisoriesView />);

    // Assert: spomky-labs/otphp is the only package with advisories in this fixture, two of them.
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.getAttribute("aria-label")).toBeTruthy();
  });

  it("shows the clean message when the document has no advisories at all", () => {
    // Arrange
    const model = loadModel("mini.json");

    // Act
    renderIn(model, stateWith({ view: "advisories" }), <AdvisoriesView />);

    // Assert
    expect(screen.getByText(/nothing was flagged/i)).toBeTruthy();
  });

  it("keeps a package's detail open across two rows for the same package, unlike FindingRow's toggle", () => {
    // Arrange: a finding with two advisories gets one AdvisoryRow per advisory, both `data-pkg`ed
    // to the same package — clicking the second one must not close what the first one opened
    // (legacy's own affordance, report.js:969-970, which never clears `open`; unlike FindingRow's
    // toggle, which closes the same package on a second click).
    const finding = makeFinding({
      package: "acme/multi",
      verdict: "abandoned",
      priority: "critical",
      advisories: [
        {
          id: "GHSA-1",
          cve: null,
          title: "First",
          link: null,
          severityRaw: "high",
          severity: "high",
          reportedAt: null,
          affectedVersions: null,
          fixedBy: null,
          fixedOnBranch: false,
        },
        {
          id: "GHSA-2",
          cve: null,
          title: "Second",
          link: null,
          severityRaw: "high",
          severity: "high",
          reportedAt: null,
          affectedVersions: null,
          fixedBy: null,
          fixedOnBranch: false,
        },
      ],
    });
    const model = flaggedModel([finding]);
    const { dispatch } = renderIn(model, stateWith({ pkg: "acme/multi" }), <AdvisoriesView />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    // Act: click the second row while the package (via the first row) is already the open one.
    fireEvent.click(rows[1] as HTMLElement);

    // Assert: still opens the same package, never closes it (`pkg: null`).
    expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "acme/multi" });
    expect(dispatch).not.toHaveBeenCalledWith({ type: "select", pkg: null });
  });

  it("shows the feed's raw severity text in the row chip, not the normalised bucket (DESIGN.md §5 M1)", () => {
    // Arrange
    const finding = makeFinding({
      package: "acme/raw-sev",
      advisories: [
        {
          id: "GHSA-1",
          cve: null,
          title: "Raw severity text",
          link: null,
          severityRaw: "Moderate",
          severity: "medium",
          reportedAt: null,
          affectedVersions: null,
          fixedBy: null,
          fixedOnBranch: false,
        },
      ],
    });
    const model = flaggedModel([finding]);

    // Act
    renderIn(model, stateWith({ view: "advisories" }), <AdvisoriesView />);

    // Assert
    expect(screen.getByText("Moderate")).toBeTruthy();
    expect(screen.queryByText("medium")).toBeNull();
  });
});

describe("RadiusView", () => {
  it("renders a card per direct requirement, its pulled packages as selectable rows", () => {
    // Arrange: vendor/direct pulls in vendor/transitive (mini.json's own chain/exposure data).
    const model = loadModel("mini.json");

    // Act
    renderIn(model, stateWith({ view: "radius" }), <RadiusView />);

    // Assert
    expect(screen.getByText("vendor/direct")).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "vendor/transitive" })).toBeTruthy();
  });

  it("shows 'flagged itself' as the whole card when a flagged parent pulls nothing in (M25)", () => {
    // Arrange
    const parent = makeFinding({ package: "acme/lonely", chain: [] });
    const model = flaggedModel([parent]);
    const withExposure: Model = {
      ...model,
      report: { ...model.report, exposure: [{ package: "acme/lonely", flagged: 1 }] },
    };

    // Act
    renderIn(withExposure, stateWith({ view: "radius" }), <RadiusView />);

    // Assert: no eyebrow count (nothing to count) and no pulled-package list.
    expect(screen.getByText("flagged itself")).toBeTruthy();
    expect(screen.queryByText(/underneath/)).toBeNull();
    expect(screen.queryByRole("list", { name: /Pulled in by/ })).toBeNull();
  });

  it("still marks a flagged parent 'flagged itself' even when it also pulls packages in (M24/M25)", () => {
    // Arrange: acme/parent is itself flagged AND pulls in one child — before the fix, that own
    // flagged status was dropped entirely once there were rows to show.
    const parent = makeFinding({ package: "acme/parent", chain: [] });
    const child = makeFinding({ package: "acme/child", chain: ["acme/parent"] });
    const model = flaggedModel([parent, child]);
    const withExposure: Model = {
      ...model,
      report: { ...model.report, exposure: [{ package: "acme/parent", flagged: 99 }] },
    };

    // Act
    renderIn(withExposure, stateWith({ view: "radius" }), <RadiusView />);

    // Assert: the eyebrow count matches the one row listed, and "flagged itself" still shows.
    expect(screen.getByText(/1 flagged package underneath/)).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "acme/child" })).toBeTruthy();
    expect(screen.getByText("flagged itself")).toBeTruthy();
  });

  it("shows no 'flagged itself' marker for a parent that is not itself flagged", () => {
    // Arrange: acme/parent never appears as a finding at all — only its pulled child does — so it
    // is not one of the run's flagged packages.
    const child = makeFinding({ package: "acme/child", chain: ["acme/parent"] });
    const model = flaggedModel([child]);
    const withExposure: Model = {
      ...model,
      report: { ...model.report, exposure: [{ package: "acme/parent", flagged: 1 }] },
    };

    // Act
    renderIn(withExposure, stateWith({ view: "radius" }), <RadiusView />);

    // Assert
    expect(screen.queryByText("flagged itself")).toBeNull();
  });

  it("never closes an already-open pulled package on a second click, unlike FindingRow's toggle", () => {
    // Arrange: acme/child is already open (state.pkg), and its own PulledRow is clicked again.
    const child = makeFinding({ package: "acme/child", chain: ["acme/parent"] });
    const model = flaggedModel([child]);
    const withExposure: Model = {
      ...model,
      report: { ...model.report, exposure: [{ package: "acme/parent", flagged: 1 }] },
    };
    const { dispatch } = renderIn(
      withExposure,
      stateWith({ view: "radius", pkg: "acme/child" }),
      <RadiusView />,
    );
    const row = screen.getByRole("listitem", { name: "acme/child" });

    // Act
    fireEvent.click(row);

    // Assert
    expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "acme/child" });
    expect(dispatch).not.toHaveBeenCalledWith({ type: "select", pkg: null });
  });
});

describe("RunView", () => {
  it("shows an em dash instead of the word 'undefined' for a run field the document never carried", () => {
    // Arrange: a report with every K6-affected scalar left null.
    const model = makeModel([]);

    // Act
    renderIn(model, stateWith({ view: "run" }), <RunView />);

    // Assert
    expect(screen.queryByText(/undefined/i)).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("reads the baseline as a short sentence, never a raw JSON dump", () => {
    // Arrange
    const model = makeModel([]);
    const withBaseline: Model = {
      ...model,
      report: {
        ...model.report,
        baseline: { path: "baseline.json", known: 3, new: 1, worsened: 0, stale: ["old/pkg"] },
      },
    };

    // Act
    renderIn(withBaseline, stateWith({ view: "run" }), <RunView />);

    // Assert
    expect(screen.queryByText(/{"path"/)).toBeNull();
    expect(screen.getByText(/baseline\.json/)).toBeTruthy();
    expect(screen.getByText(/old\/pkg/)).toBeTruthy();
  });
});
