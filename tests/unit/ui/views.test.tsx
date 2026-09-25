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
import { renderedPackages } from "../../../src/ui/views/order";
import { pickCursor } from "../../../src/ui/rowCursor";
import { makeFinding, makeMetadata, makeModel, makeSignal } from "../domain/fixtures";

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

/** Renders `ui` the way App provides it, the list's Tab stop included (`rowCursor.ts`, PD-ROWS-11):
 *  the open package's row, else `lastOpened`'s, else the first. */
function renderIn(model: Model, state: State, ui: ComponentChild, lastOpened: string | null = null) {
  const dispatch = vi.fn<(action: Action) => void>();
  const value: ReportContextValue = {
    model,
    state,
    dispatch,
    now: new Date(model.report.generatedAt),
    wide: true,
    cursor: pickCursor(renderedPackages(model, state, state.view), state.pkg, lastOpened),
    openGlossary: vi.fn(),
    openGlossaryFrom: vi.fn(),
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

  it("keeps the open package open on a second click of its own row (PD-ROWS-7)", () => {
    // Arrange
    const finding = makeFinding({ package: "open/pkg", verdict: "abandoned", priority: "critical" });
    const model = flaggedModel([finding]);
    const { dispatch } = renderIn(model, stateWith({ pkg: "open/pkg" }), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "open/pkg" });

    // Assert: already marked open per state.pkg
    expect(row.getAttribute("aria-current")).toBe("true");

    // Act
    fireEvent.click(row);

    // Assert: a click selects, it never toggles — the open package stays open (Close and Escape
    // are the ways out), so a second "yes, that one" click can't close what the reader is reading.
    expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "open/pkg" });
    expect(dispatch).not.toHaveBeenCalledWith({ type: "select", pkg: null });
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

describe("FindingRow / key-fact line and age scale (PD-ROWS-1/PD-ROWS-2, DESIGN.md §5)", () => {
  const RELEASE_THRESHOLDS = [
    ["release-warn-years", 3],
    ["release-high-years", 5],
  ] as const;

  function modelWith(findings: readonly ReturnType<typeof makeFinding>[]): Model {
    const model = flaggedModel(findings);
    return {
      ...model,
      report: { ...model.report, run: { ...model.report.run, thresholds: RELEASE_THRESHOLDS } },
    };
  }

  it("leads with the highest-level signal, not the document's own signal order", () => {
    // Arrange: S1 (warn) comes first in the document, S9 carries no level this renderer ranks at
    // all, S4 (high) comes last — the row must still lead with S4.
    const finding = makeFinding({
      package: "rank/pkg",
      signals: [
        makeSignal({ id: "S1", level: "warn", summary: "warn signal" }),
        makeSignal({ id: "S9", level: "info", summary: "info signal" }),
        makeSignal({ id: "S4", level: "high", summary: "high signal", data: { years: 8.2 } }),
      ],
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "rank/pkg" });

    // Assert
    expect(within(row).getByRole("link", { name: "S4" })).toBeTruthy();
    expect(within(row).queryByRole("link", { name: "S1" })).toBeNull();
    // PD-ROWS-4: the "+N more signals, open the package" note is gone; the detail lists them all.
    expect(within(row).queryByText(/more signal/)).toBeNull();
  });

  // regression review: on screen, only the key fact stands in for the other signals — but print
  // drops the detail pane entirely (styles/print.css), so a printed row has to carry every one of
  // them itself (PD-ROWS-1). They stay mounted, under a native `hidden` attribute rather than a
  // class, so they read as inaccessible here (`queryByRole` above) without print.css ever running —
  // `hidden` is checked directly, not through a stylesheet vitest's `css: false` never loads.
  it("keeps every other signal mounted, but inaccessible, behind a native hidden attribute (for print)", () => {
    // Arrange: same S1/S9/S4 shape as the test above — S4 leads, S1 and S9 are "the rest".
    const finding = makeFinding({
      package: "rank/pkg",
      signals: [
        makeSignal({ id: "S1", level: "warn", summary: "warn signal" }),
        makeSignal({ id: "S9", level: "info", summary: "info signal" }),
        makeSignal({ id: "S4", level: "high", summary: "high signal", data: { years: 8.2 } }),
      ],
    });
    const model = modelWith([finding]);

    // Act
    const { container } = renderIn(model, stateWith(), <FindingsView />);
    const rest = container.querySelector(".sig-rest");

    // Assert
    expect(rest).not.toBeNull();
    expect((rest as HTMLElement).hidden).toBe(true);
    expect(rest?.textContent).toContain("warn signal");
    expect(rest?.textContent).toContain("info signal");
    expect(rest?.textContent).not.toContain("high signal");
  });

  it("mounts no .sig-rest at all when the finding carries only its one key-fact signal", () => {
    // Arrange
    const finding = makeFinding({ package: "one-sig/pkg", signals: [makeSignal({ id: "S1" })] });
    const model = modelWith([finding]);

    // Act
    const { container } = renderIn(model, stateWith(), <FindingsView />);

    // Assert
    expect(container.querySelector(".sig-rest")).toBeNull();
  });

  it("breaks a level tie in SIGNAL_IDS numeric order (koel_koel's daverandom/resume shape)", () => {
    // Arrange: S2 and S4 both `high` — S2 must win, same as the real fixture's own tie.
    const finding = makeFinding({
      package: "tie/pkg",
      signals: [
        makeSignal({ id: "S4", level: "high", summary: "last push", data: { years: 8.2 } }),
        makeSignal({ id: "S2", level: "high", summary: "last release", data: { years: 8.7 } }),
      ],
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "tie/pkg" });

    // Assert
    expect(within(row).getByRole("link", { name: "S2" })).toBeTruthy();
    expect(within(row).queryByRole("link", { name: "S4" })).toBeNull();
  });

  it("says the quoted signal short, from its own data, with the document's summary as the title (PD-ROWS-4)", () => {
    // Arrange
    const finding = makeFinding({
      package: "short/pkg",
      verdict: "silent",
      signals: [
        makeSignal({
          id: "S2",
          level: "high",
          summary: "last release 2017-11-15 (8.9 years ago)",
          data: { years: 8.9, last_release: "2017-11-15T13:41:13+00:00" },
        }),
      ],
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "short/pkg" });

    // Assert
    const why = within(row).getByText("no stable release since Nov 2017");
    expect(why.closest(".fc-why")?.getAttribute("title")).toBe("last release 2017-11-15 (8.9 years ago)");
  });

  it("quotes the signal the rail filters by, when it filters by exactly one (PD-ROWS-5)", () => {
    // Arrange: S2 is the key fact on its own; filtered to S5, the row quotes S5 instead.
    const finding = makeFinding({
      package: "quoted/pkg",
      verdict: "silent",
      signals: [
        makeSignal({ id: "S2", level: "high", data: { years: 8.9 } }),
        makeSignal({ id: "S5", level: "warn", summary: "released before PHP 8" }),
      ],
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith({ filters: { ...INITIAL_STATE.filters, signal: ["S5"] } }), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "quoted/pkg" });

    // Assert
    expect(within(row).getByRole("link", { name: "S5" })).toBeTruthy();
    expect(within(row).queryByRole("link", { name: "S2" })).toBeNull();
  });

  it("falls back to the evidence sentence for a finding with no signal at all", () => {
    // Arrange
    const finding = makeFinding({
      package: "no-sig/pkg",
      signals: [],
      evidence: "the repository is archived",
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "no-sig/pkg" });

    // Assert
    expect(within(row).getByText("the repository is archived")).toBeTruthy();
    expect(within(row).queryByRole("img")).toBeNull();
  });

  it("draws the age scale, with an aria-label naming the fact and both thresholds, when the key-fact signal carries a numeric years", () => {
    // Arrange: "stale" is a verdict whose own priority does come from age (S2/S4 together), unlike
    // makeFinding's own default ("abandoned") — see the contextOnly describe block below for that.
    const finding = makeFinding({
      package: "scaled/pkg",
      verdict: "stale",
      signals: [
        makeSignal({ id: "S2", level: "high", summary: "last release 8.7 years ago", data: { years: 8.7 } }),
      ],
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "scaled/pkg" });

    // Assert
    const scale = within(row).getByRole("img", {
      name: "last release 8.7 years ago; warn at 3 years, high at 5",
    });
    expect(scale).toBeTruthy();
    // PD-ROWS-3: the same text sits in a `title`, so hovering the ticks (otherwise decorative)
    // shows a reader what they mean, not just a screen reader.
    expect(scale.getAttribute("title")).toBe(scale.getAttribute("aria-label"));
  });

  it("says why a row has no age bar, in words, and keeps the guides running through it (PD-ROWS-4)", () => {
    // Arrange: unscaled/pkg carries only S3 (no years at all); blocked/pkg's S10 says S2 could not run.
    const unscaled = makeFinding({
      package: "unscaled/pkg",
      verdict: "stale",
      signals: [makeSignal({ id: "S3", level: "high", summary: "repository archived" })],
    });
    const blocked = makeFinding({
      package: "blocked/pkg",
      verdict: "stale",
      signals: [makeSignal({ id: "S10", level: "info", data: { blocks: ["S2", "S8"] } })],
    });
    const model = modelWith([unscaled, blocked]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const unscaledRow = screen.getByRole("listitem", { name: "unscaled/pkg" });
    const blockedRow = screen.getByRole("listitem", { name: "blocked/pkg" });

    // Assert: no accessible scale, a short reason instead of a bare dash, and both guides still drawn.
    expect(within(unscaledRow).queryByRole("img")).toBeNull();
    expect(within(unscaledRow).getByText("not flagged for age")).toBeTruthy();
    expect(within(blockedRow).getByText("age not read")).toBeTruthy();
    expect(unscaledRow.querySelectorAll(".age-guide")).toHaveLength(2);
  });

  it("draws every bar on one fixed axis, max(10, 2 × high), whatever the oldest row is (PD-ROWS-4)", () => {
    // Arrange: a 12-year row no longer stretches the axis; it runs to the edge, marked as cut.
    const young = makeFinding({
      package: "young/pkg",
      verdict: "stale",
      signals: [makeSignal({ id: "S2", level: "warn", data: { years: 4 } })],
    });
    const old = makeFinding({
      package: "old/pkg",
      verdict: "stale",
      signals: [makeSignal({ id: "S2", level: "high", data: { years: 12 } })],
    });
    const model = modelWith([old, young]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const youngBar = screen
      .getByRole("listitem", { name: "young/pkg" })
      .querySelector(".age-bar") as HTMLElement;
    const oldBar = screen.getByRole("listitem", { name: "old/pkg" }).querySelector(".age-bar") as HTMLElement;

    // Assert: 4 / 10 = 40%; 12 years is capped at 100% and says it was cut; its number stays exact.
    expect(youngBar.style.width).toBe("40%");
    expect(oldBar.style.width).toBe("100%");
    expect(oldBar.className).toContain("is-over");
    expect(youngBar.className).not.toContain("is-over");
    expect(screen.getByRole("listitem", { name: "old/pkg" }).textContent).toContain("12.0");
  });

  it("captions the axis once, in the column head, with the run's own thresholds (PD-ROWS-4)", () => {
    // Arrange
    const finding = makeFinding({
      package: "scaled/pkg",
      verdict: "stale",
      signals: [makeSignal({ id: "S2", level: "high", data: { years: 8.7 } })],
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert: the old floating "age scale: warn 3 y high 5 y" line is gone; the head says it instead.
    const axis = screen.getByRole("img", { name: /^age axis:/ });
    expect(axis.getAttribute("aria-label")).toBe(
      "age axis: years since the last release, 0 to 10 and more; warn at 3 years, high at 5 years",
    );
    expect(axis.textContent).toBe("Years since release03y5y10y+");
    expect(screen.queryByText(/^age scale:/)).toBeNull();
  });

  describe("contextOnly: a scale drawn for context, not for the verdict's own priority (PD-ROWS-3)", () => {
    // sensio/framework-extra-bundle's own shape: CRITICAL from S1 (abandoned), but its S2 sits in
    // the warn zone — the scale must not read as agreeing with a priority S1 alone decided.
    it("draws a neutral bar, not the zone's tone, for an abandoned finding", () => {
      // Arrange
      const finding = makeFinding({
        package: "sensio/framework-extra-bundle",
        verdict: "abandoned",
        signals: [
          makeSignal({ id: "S1", level: "warn", summary: "marked abandoned" }),
          makeSignal({
            id: "S2",
            level: "warn",
            summary: "last release 3.6 years ago",
            data: { years: 3.6 },
          }),
        ],
      });
      const model = modelWith([finding]);

      // Act
      renderIn(model, stateWith(), <FindingsView />);
      const row = screen.getByRole("listitem", { name: "sensio/framework-extra-bundle" });
      const dot = row.querySelector(".age-bar");
      const scale = within(row).getByRole("img");

      // Assert: neutral class, not the medium (warn-zone) tone this age would otherwise carry.
      expect(dot?.className).toContain("age-bar-context");
      expect(dot?.className).not.toContain("tone-med");
      expect(scale.getAttribute("aria-label")).toContain("age shown for context");
      expect(scale.getAttribute("aria-label")).toContain("flagged for being marked abandoned");
    });

    it("draws a neutral bar for a pinned finding too", () => {
      // Arrange
      const finding = makeFinding({
        package: "acme/pinned-old",
        verdict: "pinned",
        signals: [makeSignal({ id: "S2", level: "high", data: { years: 9 } })],
      });
      const model = modelWith([finding]);

      // Act
      renderIn(model, stateWith(), <FindingsView />);
      const row = screen.getByRole("listitem", { name: "acme/pinned-old" });
      const dot = row.querySelector(".age-bar");
      const scale = within(row).getByRole("img");

      // Assert
      expect(dot?.className).toContain("age-bar-context");
      expect(dot?.className).not.toContain("tone-crit");
      expect(scale.getAttribute("aria-label")).toContain("flagged for being pinned to a branch snapshot");
    });

    it("keeps the zone's own tone for a verdict whose priority does come from age", () => {
      // Arrange: "stale" starts its priority at S2/S4's own age facts.
      const finding = makeFinding({
        package: "acme/stale-old",
        verdict: "stale",
        signals: [makeSignal({ id: "S2", level: "high", data: { years: 8 } })],
      });
      const model = modelWith([finding]);

      // Act
      renderIn(model, stateWith(), <FindingsView />);
      const row = screen.getByRole("listitem", { name: "acme/stale-old" });
      const dot = row.querySelector(".age-bar");

      // Assert
      expect(dot?.className).toContain("tone-crit");
      expect(dot?.className).not.toContain("age-bar-context");
    });
  });

  it("draws no scale when the key-fact signal is not S8/S2/S4, even though other signals are", () => {
    // Arrange: S3 (archived) outranks nothing here but is the only signal, and carries no years at
    // all — there is nothing an age scale could plot.
    const finding = makeFinding({
      package: "unscaled/pkg",
      signals: [makeSignal({ id: "S3", level: "high", summary: "repository archived" })],
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "unscaled/pkg" });

    // Assert
    expect(within(row).queryByRole("img")).toBeNull();
  });

  it("draws no scale when the run recorded no matching threshold, even though the key fact has a numeric years", () => {
    // Arrange: no thresholds at all this time, unlike modelWith()'s own fixtures.
    const finding = makeFinding({
      package: "no-threshold/pkg",
      signals: [makeSignal({ id: "S2", level: "high", data: { years: 8.7 } })],
    });
    const model = flaggedModel([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "no-threshold/pkg" });

    // Assert
    expect(within(row).queryByRole("img")).toBeNull();
  });
});

describe("FindingsView / the ledger's sentences and ditto (PD-ROWS-5/PD-ROWS-6, DESIGN.md §5)", () => {
  const THRESHOLDS = [
    ["release-warn-years", 3],
    ["release-high-years", 5],
  ] as const;

  function modelWith(findings: readonly ReturnType<typeof makeFinding>[]): Model {
    const model = flaggedModel(findings);
    return { ...model, report: { ...model.report, run: { ...model.report.run, thresholds: THRESHOLDS } } };
  }

  function hoa(name: string, years: number) {
    return makeFinding({
      package: `hoa/${name}`,
      verdict: "abandoned",
      priority: "high",
      direct: false,
      chain: ["wallabag/rulerz", `hoa/${name}`],
      signals: [
        makeSignal({ id: "S1", level: "high", summary: "marked abandoned by its repository" }),
        makeSignal({ id: "S2", level: "high", data: { years } }),
      ],
    });
  }

  it("opens each priority group with a sentence counting its members by verdict and by reach", () => {
    // Arrange
    const model = modelWith([
      makeFinding({ package: "a/silent", verdict: "silent", priority: "critical" }),
      makeFinding({ package: "b/silent", verdict: "silent", priority: "critical" }),
      makeFinding({ package: "c/gone", verdict: "abandoned", priority: "critical" }),
    ]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert
    const group = screen.getByRole("heading", { name: "critical" }).closest(".fgroup");
    expect(group?.querySelector(".fgroup-sentence")?.textContent).toBe(
      "2 silent and 1 abandoned; you require all three directly.",
    );
  });

  it("counts a mixed group's reach in the rail's own words, so its sentence stays short", () => {
    // Arrange: two direct (one of them dev-only) and one transitive.
    const model = modelWith([
      makeFinding({ package: "a/one", verdict: "abandoned", priority: "high" }),
      makeFinding({ package: "b/two", verdict: "left-behind", priority: "high", dev: true }),
      makeFinding({
        package: "c/three",
        verdict: "left-behind",
        priority: "high",
        direct: false,
        chain: ["a/one", "c/three"],
      }),
    ]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert
    const group = screen.getByRole("heading", { name: "high" }).closest(".fgroup");
    expect(group?.querySelector(".fgroup-sentence")?.textContent).toBe(
      "2 left-behind and 1 abandoned; 2 direct, 1 transitive, 1 dev-only.",
    );
  });

  it("keys a grey bar in the column head only when a visible row draws one", () => {
    // Arrange: an abandoned row with an age draws a grey (context) bar; a silent one does not.
    const grey = modelWith([hoa("compiler", 9.1)]);
    const toned = modelWith([
      makeFinding({
        package: "old/pkg",
        verdict: "silent",
        priority: "critical",
        signals: [makeSignal({ id: "S2", level: "high", data: { years: 8 } })],
      }),
    ]);

    // Act
    const { container: withGrey, unmount } = renderIn(grey, stateWith(), <FindingsView />);
    const keyText = withGrey.querySelector(".fhead .fhead-key")?.textContent;
    unmount();
    const { container: withoutGrey } = renderIn(toned, stateWith(), <FindingsView />);

    // Assert: the key uses the same words an age cell with no bar does; no footnote below the list.
    expect(keyText).toBe("not flagged for age");
    expect(withoutGrey.querySelector(".fhead-key")).toBeNull();
    expect(withoutGrey.querySelector(".fledger-foot")).toBeNull();
  });

  it("breaks a long way in after its vendor's slash, never cutting it short", () => {
    // Arrange
    const model = modelWith([
      makeFinding({
        package: "gedmo/doctrine-extensions",
        verdict: "abandoned",
        priority: "high",
        direct: false,
        chain: ["stof/doctrine-extensions-bundle", "gedmo/doctrine-extensions"],
      }),
    ]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const reach = screen
      .getByRole("listitem", { name: "gedmo/doctrine-extensions" })
      .querySelector(".fc-reach");

    // Assert: the whole name is there, with a break opportunity after the slash and the rest kept
    // together as one unit.
    expect(reach?.textContent).toBe("via stof/doctrine-extensions-bundle");
    expect(reach?.querySelector("wbr")).not.toBeNull();
    expect(reach?.querySelector(".fc-unit")?.textContent).toBe("doctrine-extensions-bundle");
  });

  it("writes one sentence above three or more consecutive alike rows, and none above two", () => {
    // Arrange: three hoa/* rows through the same parent, then two through another.
    const other = (name: string) =>
      makeFinding({
        package: `x/${name}`,
        verdict: "abandoned",
        priority: "high",
        direct: false,
        chain: ["acme/other", `x/${name}`],
        signals: [makeSignal({ id: "S1", level: "high" })],
      });
    const model = modelWith([
      hoa("compiler", 9.1),
      hoa("event", 9.7),
      hoa("math", 9.4),
      other("a"),
      other("b"),
    ]);

    // Act
    const { container } = renderIn(model, stateWith(), <FindingsView />);

    // Assert
    const notes = container.querySelectorAll(".frun-note");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toBe(
      "These 3 hoa/* packages are all marked abandoned by their repository and were last released 9.1–9.7 years ago. All come in through wallabag/rulerz.",
    );
    // Every row stays a row; the note folds nothing away.
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("reads a left-behind run's branch age straight on from its reason, in two sentences", () => {
    // Arrange: three left-behind rows on old branches, all through one parent.
    const behind = (name: string, years: number) =>
      makeFinding({
        package: `${name}/lib`,
        verdict: "left-behind",
        priority: "high",
        direct: false,
        chain: ["mautic/core-lib", `${name}/lib`],
        signals: [makeSignal({ id: "S8", level: "warn", data: { years } })],
      });
    const model = modelWith([behind("a", 3.7), behind("b", 10.3), behind("c", 5)]);

    // Act
    const { container } = renderIn(model, stateWith(), <FindingsView />);

    // Assert: no comma splice ("…older branch, their branch last released …, and all come in…").
    expect(container.querySelector(".frun-note")?.textContent).toBe(
      "These 3 packages are all left behind on older branches and were last released 3.7–10.3 years ago. All come in through mautic/core-lib.",
    );
  });

  it("says a run of direct requirements is required directly, for development when it is", () => {
    // Arrange: three direct dev-only abandoned rows from one vendor, with no age signal.
    const model = modelWith(
      ["a", "b", "c"].map((v) =>
        makeFinding({
          package: `acme/${v}`,
          verdict: "abandoned",
          priority: "high",
          dev: true,
          signals: [makeSignal({ id: "S3", level: "high" })],
        }),
      ),
    );

    // Act
    const { container } = renderIn(model, stateWith(), <FindingsView />);

    // Assert
    expect(container.querySelector(".frun-note")?.textContent).toBe(
      "These 3 acme/* packages are all archived upstream. You require each one directly, for development only.",
    );
  });

  it("keeps each count and its hyphenated word in one unit that cannot split at the hyphen", () => {
    // Arrange
    const model = modelWith([
      makeFinding({ package: "a/one", verdict: "old-promise", priority: "high", dev: true }),
      makeFinding({ package: "b/two", verdict: "left-behind", priority: "high" }),
    ]);

    // Act
    const { container } = renderIn(model, stateWith(), <FindingsView />);

    // Assert
    const units = [...container.querySelectorAll(".fgroup-sentence .fl-unit")].map((u) => u.textContent);
    expect(units).toEqual(["1 left-behind", "1 old-promise", "1 dev-only"]);
  });

  it("quietens what repeats the row above, but never the verdict's tone, and starts fresh after a note", () => {
    // Arrange
    const model = modelWith([hoa("compiler", 9.1), hoa("event", 9.7), hoa("math", 9.4)]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const first = screen.getByRole("listitem", { name: "hoa/compiler" });
    const second = screen.getByRole("listitem", { name: "hoa/event" });

    // Assert
    expect(first.querySelector(".fc-why")?.className).not.toContain("is-ditto");
    expect(first.querySelector(".fc-reach")?.className).not.toContain("is-ditto");
    expect(second.querySelector(".fc-why")?.className).toContain("is-ditto");
    expect(second.querySelector(".fc-reach")?.className).toContain("is-ditto");
    expect(second.querySelector(".fc-vendor")?.className).toContain("is-ditto");
    // The verdict word is still there, in the row's own tone class, only lighter.
    expect(second.querySelector(".fc-verdict")?.textContent).toBe("abandoned");
    expect(second.className).toContain("tone-crit");
  });

  it("never quietens a repeated verdict in the critical group, and elsewhere drops only its weight", () => {
    // Arrange
    const crit = (name: string) =>
      makeFinding({ package: `c/${name}`, verdict: "silent", priority: "critical", direct: true });
    const model = modelWith([crit("one"), crit("two"), hoa("compiler", 9.1), hoa("event", 9.7)]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert
    const verdict = (name: string) =>
      screen.getByRole("listitem", { name }).querySelector(".fc-verdict")?.className ?? "";
    expect(verdict("c/two")).not.toContain("is-ditto");
    expect(verdict("hoa/event")).toContain("is-ditto");
  });

  it("keeps the baseline badge, the dev marker and the open row's state", () => {
    // Arrange
    const model = modelWith([
      makeFinding({
        package: "new/pkg",
        verdict: "stale",
        priority: "low",
        dev: true,
        baseline: { status: "new", previousVerdict: null },
      }),
    ]);

    // Act
    renderIn(model, stateWith({ pkg: "new/pkg" }), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "new/pkg" });

    // Assert
    expect(within(row).getByText("new")).toBeTruthy();
    expect(within(row).getByText("dev")).toBeTruthy();
    expect(row.getAttribute("aria-current")).toBe("true");
  });

  it("draws no axis, and no guides, when the run recorded no thresholds", () => {
    // Arrange
    const model = flaggedModel([
      makeFinding({
        package: "a/b",
        verdict: "stale",
        signals: [makeSignal({ id: "S2", data: { years: 4 } })],
      }),
    ]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert
    expect(screen.queryByRole("img", { name: /^age axis:/ })).toBeNull();
    expect(screen.getByRole("listitem", { name: "a/b" }).querySelectorAll(".age-guide")).toHaveLength(0);
  });
});

describe("PackagesView", () => {
  it("lists every package, not only the flagged ones, as focusable and selectable rows", () => {
    // Arrange
    const model = loadModel("mini.json");

    // Act
    renderIn(model, stateWith({ view: "packages" }), <PackagesView />);

    // Assert: private/thing (finished) has no rot verdict but still belongs on this tab (M6: rows
    // are focusable, unlike legacy's plain `<tr>`). Focusable, not each a Tab stop: with nothing open
    // only the first row is in the Tab order (PD-ROWS-11), so this one is `tabindex="-1"`.
    const row = screen.getByRole("row", { name: "private/thing" });
    expect(row.hasAttribute("tabindex")).toBe(true);
    expect(row.tabIndex).toBe(-1);
    // PD-ROWS-12: `aria-current`, as on every other tab's rows; `aria-selected` used to mark the open
    // row here, which a plain table's row gives no meaning to.
    expect(row.hasAttribute("aria-selected")).toBe(false);
    expect(row.hasAttribute("aria-current")).toBe(false);
  });

  it("marks the open package's row with aria-current, as every other tab's rows do (PD-ROWS-12)", () => {
    const model = loadModel("mini.json");
    renderIn(model, stateWith({ view: "packages", pkg: "vendor/snapshot" }), <PackagesView />);

    expect(screen.getByRole("row", { name: "vendor/snapshot" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("row", { name: "private/thing" }).hasAttribute("aria-current")).toBe(false);
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

  it("names a zero libyears value as the installed release being the newest known one, not silence (a walk finding)", () => {
    // Arrange: libyears 0 on its own reads as "fresh" next to an abandoned package, when it is
    // really the domain's own clamp (`domain/libyears.ts#libyearsAtZero`) — the metadata's own
    // newest version matches what is installed, so that is the reason this cell should give.
    const finding = makeFinding({
      package: "acme/quiet",
      verdict: "abandoned",
      libyears: 0,
      version: "v1.0.0",
    });
    const model = makeModel([finding]);
    const withMetadata = {
      ...model,
      details: new Map([
        [
          finding.package,
          {
            metadata: makeMetadata({ lastStableVersion: "v1.0.0" }),
            lock: null,
            activity: null,
            repositoryLink: null,
          },
        ],
      ]),
    };

    // Act
    renderIn(withMetadata, stateWith({ view: "packages" }), <PackagesView />);

    // Assert
    const row = screen.getByRole("row", { name: "acme/quiet" });
    expect(within(row).getByText(/the installed release is the newest/)).toBeTruthy();
  });

  it("gives a measured, non-zero libyears value no such note", () => {
    // Arrange
    const finding = makeFinding({ package: "acme/behind", verdict: "stale", libyears: 1.5 });
    const model = makeModel([finding]);

    // Act
    renderIn(model, stateWith({ view: "packages" }), <PackagesView />);

    // Assert
    const row = screen.getByRole("row", { name: "acme/behind" });
    expect(row.textContent).not.toContain("newest");
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

  it("says no advisory affects the lock when the document has none and the check ran (PD-LEDGER-1)", () => {
    // Arrange
    const model = loadModel("mini.json");

    // Act
    renderIn(model, stateWith({ view: "advisories" }), <AdvisoriesView />);

    // Assert: the summary band's own words, not Findings' "Nothing was flagged".
    expect(screen.getByText("No advisory affects this lock.")).toBeTruthy();
    expect(screen.queryByText(/nothing was flagged/i)).toBeNull();
  });

  it("never reads as clean when the run says the advisory check may not have run (PD-LEDGER-1)", () => {
    // Arrange
    const model = loadModel("mini-advisory-incomplete.json");

    // Act
    renderIn(model, stateWith({ view: "advisories" }), <AdvisoriesView />);

    // Assert
    expect(screen.getByText(/No advisory found; 2 packages could not be confirmed clear/)).toBeTruthy();
    expect(screen.queryByText(/affects this lock/)).toBeNull();
    expect(screen.getByRole("button", { name: "Run data" })).toBeTruthy();
  });

  it("keeps a package's detail open across two rows for the same package", () => {
    // Arrange: a finding with two advisories gets one AdvisoryRow per advisory, both `data-pkg`ed
    // to the same package — clicking the second one must not close what the first one opened
    // (legacy's own affordance, report.js:969-970, which never clears `open` — and, since PD-ROWS-7,
    // every list's rule).
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

    // Assert: the row shows the feed's word; only the answer above counts by the bucket.
    const row = screen.getByRole("listitem", { name: "acme/raw-sev, Moderate, GHSA-1" });
    expect(within(row).getByText("Moderate")).toBeTruthy();
    // One advisory: its severity is named as a severity, apart from the band's priority words.
    expect(document.querySelector(".al-answer")?.textContent).toMatch(
      /^1 medium-severity advisory on acme\/raw-sev, /,
    );
    expect(within(row).queryByText("medium")).toBeNull();
  });
});

describe("AdvisoriesView as a ledger (PD-ADV-1..3)", () => {
  it("answers first: count, packages, severities, scope, fix and age, from wallabag's own data", () => {
    const { container } = renderIn(
      loadModel("wallabag_wallabag.json"),
      stateWith({ view: "advisories" }),
      <AdvisoriesView />,
    );

    const answer = container.querySelector(".al-answer")?.textContent.replace(/\s+/g, " ");
    expect(answer).toBe(
      "2 advisories on spomky-labs/otphp, by severity 1 high and 1 medium, both in production. Neither is fixed on " +
        "the branch you are on; both are fixed only by 11.5.0, on another branch. Both were reported 4 months ago.",
    );
    // One group: the answer already says what its sentence would, so the head is name and count.
    expect(container.querySelectorAll(".al-group-sentence")).toHaveLength(0);
    expect(container.querySelector(".al-group-head")?.textContent).toContain("2 advisories");
  });

  it("counts a mixed lock by fix shape and dates, and gives each group its own sentence", () => {
    const { container } = renderIn(
      loadModel("mini-advisories.json"),
      stateWith({ view: "advisories" }),
      <AdvisoriesView />,
    );

    const answer = container.querySelector(".al-answer")?.textContent.replace(/\s+/g, " ");
    expect(answer).toBe(
      "6 advisories on 5 packages, by severity 1 critical, 2 high, 1 medium, 1 low and 1 unrated; 4 in " +
        "production, 2 dev-only. Of them, 3 are fixed on the branch you are on, 2 only on another branch " +
        "and 1 with no fix listed. Reported between 2 weeks and 2.6 years ago.",
    );
    const heads = [...container.querySelectorAll(".al-group-head h2")].map((h) => h.textContent);
    expect(heads).toEqual([
      "A release on the branch you are on",
      "Only a move to another branch",
      "No fix listed",
    ]);
    const sentences = [...container.querySelectorAll(".al-group-sentence")].map((p) =>
      p.textContent.replace(/\s+/g, " "),
    );
    expect(sentences).toEqual([
      "1 critical, 1 medium and 1 low on acme/http-client and acme/yaml; fixed by 2.3.4 and 4.1.2.",
      "1 high and 1 unrated on acme/templating and acme/markdown; fixed by 3.0.2 and 2.0.0.",
      "1 high on acme/debug-toolbar.",
    ]);
  });

  it("gives every row its severity, ids, package, scope, range, fix and age", () => {
    renderIn(loadModel("mini-advisories.json"), stateWith({ view: "advisories" }), <AdvisoriesView />);

    const rows = screen.getAllByRole("listitem");
    // One package can carry several advisories: each row's name adds its severity and CVE or id.
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "acme/http-client, critical, CVE-2026-31337",
      "acme/http-client, medium, CVE-2026-29904",
      "acme/yaml, low, GHSA-p9xw-66fq-2mhv",
      "acme/templating, high, PKSA-9z1c-b2tt-x0lq",
      "acme/markdown, unrated, CVE-2025-40412",
      "acme/debug-toolbar, high, CVE-2024-33391",
    ]);
    expect(rows.map((row) => row.dataset.pkg)).toEqual([
      "acme/http-client",
      "acme/http-client",
      "acme/yaml",
      "acme/templating",
      "acme/markdown",
      "acme/debug-toolbar",
    ]);
    const at = (i: number): HTMLElement => {
      const row = rows[i];
      if (row === undefined) throw new Error(`no row ${String(i)}`);
      return row;
    };
    const [critical, medium, low, unrated, unfixed] = [at(0), at(1), at(2), at(4), at(5)];
    expect(critical.querySelector(".ac-sev")?.textContent).toBe("critical");
    expect(within(critical).getByRole("link", { name: "CVE-2026-31337" }).getAttribute("href")).toBe(
      "https://nvd.nist.gov/vuln/detail/CVE-2026-31337",
    );
    expect(critical.querySelector(".ac-fix")?.textContent).toBe("fixed by 2.3.4 on your branch");
    expect(critical.querySelector(".ac-aff")?.textContent).toBe("affects >=2.0.0,<2.3.4");
    expect(critical.querySelector(".ac-scope")?.textContent).toBe("prod");
    // 43 days: weeks, not the page's rounded month.
    expect(critical.querySelector(".ac-num")?.textContent).toBe("6 wk");
    expect(critical.querySelector(".ac-reported")?.textContent).toBe("reported 2026-08-12, 6 weeks ago");
    // The row under it names the same package: quieter, never removed (PD-ROWS-5).
    expect(critical.querySelector(".ac-name.is-ditto")).toBeNull();
    expect(medium.querySelector(".ac-name.is-ditto")).not.toBeNull();
    expect(medium.querySelector(".ac-ditto")?.getAttribute("aria-hidden")).toBe("true");
    expect(medium.querySelector(".ac-name")?.textContent).toContain("acme/http-client");
    expect(within(low).getByText("no CVE assigned")).toBeTruthy();
    expect(unrated.querySelector(".ac-sev")?.textContent).toBe("unrated");
    expect(unrated.querySelector(".ac-scope")?.textContent).toBe("dev");
    expect(unfixed.querySelector(".ac-fix")?.textContent).toBe("no fix listed");
    expect(unfixed.querySelector(".ac-num")?.textContent).toBe("2.6 y");
  });

  it("says under the answer when the advisory check may not have covered every package", () => {
    const { container } = renderIn(
      loadModel("mini-advisories-partial.json"),
      stateWith({ view: "advisories" }),
      <AdvisoriesView />,
    );

    expect(container.querySelector(".al-answer")?.textContent).toMatch(/^6 advisories on 5 packages/);
    const partial = container.querySelector(".al-partial")?.textContent.replace(/\s+/g, " ");
    expect(partial).toBe(
      "Check incomplete The advisory check may not have run for every package, so this list may be " +
        "partial: a package with no row here could not be confirmed clear. The run's own notes say why, " +
        "under Run data.",
    );
    expect(screen.getByRole("button", { name: "Run data" })).toBeTruthy();
  });

  it("says nothing of an incomplete check when the run reports none", () => {
    const { container } = renderIn(
      loadModel("mini-advisories.json"),
      stateWith({ view: "advisories" }),
      <AdvisoriesView />,
    );
    expect(container.querySelector(".al-partial")).toBeNull();
  });

  it("says 'matching' under a filter, and what the unfiltered count is", () => {
    const { container } = renderIn(
      loadModel("mini-advisories.json"),
      stateWith({ view: "advisories", q: "severity:high" }),
      <AdvisoriesView />,
    );

    expect(container.querySelector(".al-answer")?.textContent).toMatch(/^2 matching advisories on /);
    expect(container.querySelector(".al-scope")?.textContent).toBe(
      "Only advisories that match the filter are counted; without it there are 6.",
    );
  });

  it("offers Clear filters when a filter hides every advisory", () => {
    renderIn(
      loadModel("mini-advisories.json"),
      stateWith({ view: "advisories", q: "nothing-matches-this" }),
      <AdvisoriesView />,
    );
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });
});

describe("AdvisoryChip on Findings and All packages rows (PD-ADV-4)", () => {
  it("draws a square per advisory in its severity, the count, and a title quoting the fix", () => {
    const { container } = renderIn(
      loadModel("mini-advisories.json"),
      stateWith({ view: "packages" }),
      <PackagesView />,
    );

    const row = screen.getByRole("row", { name: "acme/http-client" });
    const chip = row.querySelector(".adv-chip");
    expect(chip?.textContent).toBe("2 advisories");
    expect(chip?.classList.contains("tone-crit")).toBe(true);
    expect([...(chip?.querySelectorAll(".adv-chip-marks i") ?? [])].map((i) => i.className)).toEqual([
      "tone-crit",
      "tone-med",
    ]);
    expect(chip?.getAttribute("title")).toBe("1 critical, 1 medium · fixed by 2.3.4 on your branch");
    // A package with none carries no chip.
    expect(screen.getByRole("row", { name: "acme/framework" }).querySelector(".adv-chip")).toBeNull();
    expect(container.querySelectorAll(".adv-chip")).toHaveLength(5);
  });

  it("is the same chip on a Findings row", () => {
    renderIn(loadModel("mini-advisories.json"), stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "acme/templating" });
    expect(row.querySelector(".fc-why .adv-chip")?.textContent).toBe("1 advisory");
  });
});

describe("RadiusView (PD-RADIUS-1..5)", () => {
  function withExposure(model: Model, exposure: readonly { package: string; flagged: number }[]): Model {
    return { ...model, report: { ...model.report, exposure } };
  }
  const child = (pkg: string, parent: string, extra: Parameters<typeof makeFinding>[0] = {}) =>
    makeFinding({ package: pkg, direct: false, chain: [parent, pkg], directDependents: [parent], ...extra });

  it("answers first, then a row per direct requirement whose packages open under it", () => {
    // Arrange: vendor/direct pulls in vendor/transitive (mini.json's own chain/exposure data).
    const model = loadModel("mini.json");

    // Act
    renderIn(model, stateWith({ view: "radius" }), <RadiusView />);

    // Assert: the answer names the row; the row is a list item; its package is folded away.
    // exposure[] is not every direct requirement, so the answer never says "your one".
    expect(
      screen.getByText(/the one direct requirement lockrot's exposure list names, pulls in/),
    ).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "vendor/direct" })).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: "vendor/transitive" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Show the 1 package listed under vendor\/direct/ })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("shows an open row's packages, and its toggle asks to close it", () => {
    // Arrange
    const model = loadModel("mini.json");
    const { dispatch } = renderIn(
      model,
      stateWith({ view: "radius", disclosure: { "row:vendor/direct": true } }),
      <RadiusView />,
    );
    const toggle = screen.getByRole("button", { name: /Show the 1 package/ });

    // Act
    fireEvent.click(toggle);

    // Assert
    expect(screen.getByRole("listitem", { name: "vendor/transitive" })).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(dispatch).toHaveBeenCalledWith({ type: "disclose", key: "row:vendor/direct", open: false });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "select" }));
  });

  it("opens the requirement itself on a click on its row, and a listed package on a click on its own", () => {
    // Arrange
    const kid = child("acme/child", "acme/parent");
    const model = withExposure(flaggedModel([kid]), [{ package: "acme/parent", flagged: 1 }]);
    const { dispatch } = renderIn(model, stateWith({ view: "radius", pkg: "acme/child" }), <RadiusView />);

    // Act
    fireEvent.click(screen.getByRole("listitem", { name: "acme/child" }));
    fireEvent.click(screen.getByText("parent"));

    // Assert: the nested row opened its own package only; the parent's name opened the parent.
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "select", pkg: "acme/child" },
      { type: "select", pkg: "acme/parent" },
    ]);
  });

  it("says a flagged requirement is flagged itself beside the packages it pulls in (M24/M25)", () => {
    // Arrange
    const parent = makeFinding({
      package: "acme/parent",
      direct: true,
      chain: ["acme/parent"],
      verdict: "pinned",
    });
    const model = withExposure(flaggedModel([parent, child("acme/child", "acme/parent")]), [
      { package: "acme/parent", flagged: 99 },
    ]);

    // Act
    renderIn(model, stateWith({ view: "radius" }), <RadiusView />);

    // Assert: the squares count what is listed, and the parent's own flag is a tag beside its name.
    expect(screen.getByRole("img", { name: /^1 flagged package listed under it/ })).toBeTruthy();
    expect(screen.getByText("pinned itself")).toBeTruthy();
  });

  it("folds a flagged requirement that lists nothing into its own tail, open when nothing ranks", () => {
    // Arrange
    const parent = makeFinding({ package: "acme/lonely", chain: ["acme/lonely"], verdict: "stale" });
    const model = withExposure(flaggedModel([parent]), [{ package: "acme/lonely", flagged: 0 }]);

    // Act
    renderIn(model, stateWith({ view: "radius" }), <RadiusView />);

    // Assert: no ranked row above it, so no "more", and the tail is the list — open, under the head.
    const head = screen.getByRole("button", { name: /^1 direct requirement is flagged itself/ });
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listitem", { name: "acme/lonely" })).toBeTruthy();
    expect(screen.queryByText(/Below the ranking/)).toBeNull();
  });

  it("scopes every sentence to the filter and keeps what the filter hides countable (PD-RADIUS-6)", () => {
    // Arrange: acme/parent is flagged and lists two packages; the rail keeps only direct ones.
    const parent = makeFinding({
      package: "acme/parent",
      direct: true,
      chain: ["acme/parent"],
      verdict: "pinned",
    });
    const model = withExposure(
      flaggedModel([parent, child("acme/a", "acme/parent"), child("acme/b", "acme/parent")]),
      [{ package: "acme/parent", flagged: 2 }],
    );
    const filters = { ...stateWith({ view: "radius" }).filters, scope: ["direct"] };

    // Act
    renderIn(model, stateWith({ view: "radius", filters }), <RadiusView />);

    // Assert
    expect(screen.getByText(/^No flagged package/).textContent).toBe(
      "No flagged package that matches the filter sits under the one direct requirement lockrot's exposure list names.",
    );
    expect(screen.getByText(/Only flagged packages that match the filter are counted/).textContent).toBe(
      "Only flagged packages that match the filter are counted. Without it, 2 sit under the one direct requirement lockrot's exposure list names.",
    );
    expect(screen.getByText("None of the 2 flagged packages listed under it match the filter.")).toBeTruthy();
    expect(screen.queryByText("Nothing flagged is listed under it.")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: /^1 direct requirement matches the filter itself \( ?pinned ?\); nothing listed under it does\./,
      }),
    ).toBeTruthy();
  });

  it("names no tag for a requirement that is not flagged", () => {
    const model = withExposure(flaggedModel([child("acme/child", "acme/parent")]), [
      { package: "acme/parent", flagged: 1 },
    ]);

    renderIn(model, stateWith({ view: "radius" }), <RadiusView />);

    expect(screen.queryByText(/itself/)).toBeNull();
  });

  it("jumps from what a row reaches to the row that lists it", () => {
    // Arrange: acme/deep is listed under acme/lib, and acme/bundle reaches it too.
    const deep = child("acme/deep", "acme/lib", { directDependents: ["acme/lib", "acme/bundle"] });
    const other = child("acme/other", "acme/bundle");
    const model = withExposure(flaggedModel([deep, other]), [
      { package: "acme/bundle", flagged: 2 },
      { package: "acme/lib", flagged: 1 },
    ]);
    const { dispatch } = renderIn(model, stateWith({ view: "radius" }), <RadiusView />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "acme/lib" }));

    // Assert
    expect(screen.getByText(/\+1 more it reaches, listed under/)).toBeTruthy();
    expect(dispatch).toHaveBeenCalledWith({ type: "disclose", key: "row:acme/lib", open: true });
  });

  it("names flagged direct requirements that exposure[] leaves out, once, at the end", () => {
    const alone = makeFinding({ package: "acme/alone", chain: ["acme/alone"], verdict: "silent" });
    const model = withExposure(flaggedModel([alone, child("acme/child", "acme/parent")]), [
      { package: "acme/parent", flagged: 1 },
    ]);

    renderIn(model, stateWith({ view: "radius" }), <RadiusView />);

    expect(screen.getByText(/1 flagged direct requirement has/)).toBeTruthy();
    expect(screen.getByText("acme/alone")).toBeTruthy();
  });

  it("marks a missing value with a dash, and says the tail's ages are the requirement's own", () => {
    // Arrange: acme/lonely is flagged, lists nothing and has no age signal.
    const lonely = makeFinding({ package: "acme/lonely", chain: ["acme/lonely"], verdict: "stale" });
    const base = withExposure(flaggedModel([lonely]), [{ package: "acme/lonely", flagged: 0 }]);
    const thresholds = [
      ["release-warn-years", 3],
      ["release-high-years", 5],
    ] as const;
    const model = { ...base, report: { ...base.report, run: { ...base.report.run, thresholds } } };

    // Act
    const { container } = renderIn(model, stateWith({ view: "radius" }), <RadiusView />);
    const row = screen.getByRole("listitem", { name: "acme/lonely" });

    // Assert: a dash, never a "0" or a phrase across the guides; the words are the cell's name.
    expect(row.querySelector(".rl-num")?.textContent).toBe("–");
    expect(within(row).getByRole("img", { name: "not flagged for age" })).toBeTruthy();
    expect(row.querySelector(".age-none")).toBeNull();
    expect(row.querySelectorAll(".age-guide")).toHaveLength(2);
    expect(container.querySelector(".rl-head.is-own .fhead-axis-label")?.textContent).toBe(
      "Its own years since release",
    );
  });

  it("quotes the evidence a flagged-itself row matched the search in", () => {
    // Arrange: acme/bundle's name lacks "hoa"; its evidence names the hoa/* packages it pulls in.
    const bundle = makeFinding({
      package: "acme/bundle",
      chain: ["acme/bundle"],
      verdict: "pinned",
      evidence: "pinned to branch snapshot dev-master; pulls in 2 flagged packages: hoa/compiler, hoa/event",
    });
    const model = withExposure(flaggedModel([bundle]), [{ package: "acme/bundle", flagged: 0 }]);

    // Act
    renderIn(model, stateWith({ view: "radius", q: "hoa" }), <RadiusView />);
    const row = screen.getByRole("listitem", { name: "acme/bundle" });

    // Assert
    expect(within(row).getByText("matched in:")).toBeTruthy();
    expect(within(row).getByText("hoa").tagName).toBe("MARK");
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

  it("fail-on: an em dash for a document that predates the field, the word 'none' only when the run said so (PD-SUMMARY-3)", () => {
    // Arrange: makeModel([]) leaves run.failOn null, same as a document written before the field.
    const predatesField = makeModel([]);
    const explicitNone: Model = {
      ...predatesField,
      report: { ...predatesField.report, run: { ...predatesField.report.run, failOn: "none" } },
    };
    const gated: Model = {
      ...predatesField,
      report: { ...predatesField.report, run: { ...predatesField.report.run, failOn: "critical" } },
    };

    // Act + Assert
    const { unmount: unmountPredates } = renderIn(predatesField, stateWith({ view: "run" }), <RunView />);
    expect(screen.getByText("fail-on").nextElementSibling?.textContent).toBe("—");
    unmountPredates();

    const { unmount: unmountNone } = renderIn(explicitNone, stateWith({ view: "run" }), <RunView />);
    expect(screen.getByText("fail-on").nextElementSibling?.textContent).toBe("none");
    unmountNone();

    renderIn(gated, stateWith({ view: "run" }), <RunView />);
    expect(screen.getByText("fail-on").nextElementSibling?.textContent).toBe("critical");
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

// PD-ROWS-11: every row used to be a Tab stop, and each Findings row's signal link another, so Tab
// walked two stops a package before it left the list. One row is the list's Tab stop now.
describe("the list's one Tab stop (PD-ROWS-11)", () => {
  function tabStops(container: Element): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>("[data-pkg]"))
      .filter((row) => row.tabIndex === 0)
      .map((row) => row.getAttribute("data-pkg") ?? "");
  }

  it("is the first row with nothing open, and every other row stays focusable", () => {
    const model = loadModel("mini.json");
    const { container } = renderIn(model, stateWith({ view: "packages" }), <PackagesView />);

    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-pkg]"));
    expect(tabStops(container)).toEqual([rows[0]?.getAttribute("data-pkg")]);
    expect(rows.every((row) => row.hasAttribute("tabindex"))).toBe(true);
  });

  it("is the open package's row, and only that row's links are tabbable", () => {
    const model = loadModel("mini.json");
    const { container } = renderIn(
      model,
      stateWith({ view: "findings", pkg: "vendor/snapshot" }),
      <FindingsView />,
    );

    expect(tabStops(container)).toEqual(["vendor/snapshot"]);
    for (const row of container.querySelectorAll<HTMLElement>("[data-pkg]")) {
      const tabbable = row.getAttribute("data-pkg") === "vendor/snapshot";
      for (const link of row.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        expect(link.tabIndex).toBe(tabbable ? 0 : -1);
      }
    }
  });

  it("stays on the package last opened once Escape or Close has closed it", () => {
    const model = loadModel("mini.json");
    const { container } = renderIn(
      model,
      stateWith({ view: "packages" }),
      <PackagesView />,
      "vendor/snapshot",
    );

    expect(tabStops(container)).toEqual(["vendor/snapshot"]);
  });

  it("keeps an Advisories row's own links out of the Tab order on every row but the Tab stop's", () => {
    const advised = (pkg: string) =>
      makeFinding({
        package: pkg,
        verdict: "abandoned",
        priority: "critical",
        advisories: [
          {
            id: `GHSA-${pkg}`,
            cve: null,
            title: pkg,
            link: `https://example.com/${pkg}`,
            severityRaw: "high",
            severity: "high",
            reportedAt: null,
            affectedVersions: null,
            fixedBy: null,
            fixedOnBranch: false,
          },
        ],
      });
    const model = flaggedModel([advised("acme/one"), advised("acme/two")]);
    const { container } = renderIn(
      model,
      stateWith({ view: "advisories", pkg: "acme/two" }),
      <AdvisoriesView />,
    );

    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-pkg]"));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const own = row.getAttribute("data-pkg") === "acme/two";
      expect(row.tabIndex).toBe(own ? 0 : -1);
      const link = row.querySelector<HTMLAnchorElement>("a[href]");
      expect(link?.tabIndex).toBe(own ? 0 : -1);
    }
  });

  // PD-ROWS-12: a package under two advisories was the Tab stop on both of its rows.
  it("is a package's first row only, when Advisories lists it twice", () => {
    const advisory = (id: string) => ({
      id,
      cve: null,
      title: id,
      link: `https://example.com/${id}`,
      severityRaw: "high",
      severity: "high" as const,
      reportedAt: null,
      affectedVersions: null,
      fixedBy: null,
      fixedOnBranch: false,
    });
    const model = flaggedModel([
      makeFinding({
        package: "acme/twice",
        verdict: "abandoned",
        priority: "critical",
        advisories: [advisory("GHSA-one"), advisory("GHSA-two")],
      }),
    ]);
    const { container } = renderIn(
      model,
      stateWith({ view: "advisories", pkg: "acme/twice" }),
      <AdvisoriesView />,
    );

    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-pkg]"));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1]);
    expect(rows.map((row) => row.querySelector("a[href]")?.getAttribute("tabindex") ?? null)).toEqual([
      null,
      "-1",
    ]);
    // Both rows name the open package, so both read as current.
    expect(rows.every((row) => row.getAttribute("aria-current") === "true")).toBe(true);
  });
});
