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
import { makeFinding, makeModel, makeSignal } from "../domain/fixtures";

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
    expect(within(row).getByText(/2 more signals, open the package/)).toBeTruthy();
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

  it('singularises "+N more" and omits it entirely for a finding with only one signal', () => {
    // Arrange
    const one = makeFinding({ package: "one-sig/pkg", signals: [makeSignal({ id: "S1" })] });
    const two = makeFinding({
      package: "two-sig/pkg",
      signals: [makeSignal({ id: "S1" }), makeSignal({ id: "S3" })],
    });
    const model = modelWith([one, two]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert
    const oneRow = screen.getByRole("listitem", { name: "one-sig/pkg" });
    expect(within(oneRow).queryByText(/more signal/)).toBeNull();
    const twoRow = screen.getByRole("listitem", { name: "two-sig/pkg" });
    expect(within(twoRow).getByText(/1 more signal, open the package/)).toBeTruthy();
    expect(within(twoRow).queryByText(/1 more signals/)).toBeNull();
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

  it("reserves the age scale's own width on a row with a key fact but no scale, so its signal text does not wrap wider than a scaled neighbour (PD-ROWS-3)", () => {
    // Arrange: unscaled/pkg carries only S3 (no years at all); scaled/pkg carries S2 and does draw
    // a scale — both in the same list, so a shared row width is actually at stake.
    const unscaled = makeFinding({
      package: "unscaled/pkg",
      verdict: "stale",
      signals: [makeSignal({ id: "S3", level: "high", summary: "repository archived" })],
    });
    const scaled = makeFinding({
      package: "scaled/pkg",
      verdict: "stale",
      signals: [makeSignal({ id: "S2", level: "high", data: { years: 4 } })],
    });
    const model = modelWith([unscaled, scaled]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);
    const row = screen.getByRole("listitem", { name: "unscaled/pkg" });

    // Assert: no accessible scale (nothing to plot), but the placeholder still reserves the track's
    // own footprint, aria-hidden so it names no fact of its own.
    expect(within(row).queryByRole("img")).toBeNull();
    const placeholder = row.querySelector(".age-scale-placeholder");
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shares one maximum across every row in the list, so the same years plots at the same position regardless of which row is oldest (PD-ROWS-3)", () => {
    // Arrange: a 4-year row alone would floor its own track at 10; a 12-year row in the same list
    // pushes the shared maximum to 12, moving the 4-year row's own dot left of where it would sit on
    // its own 10-year track (40% instead of the un-shared 50%).
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
    const youngRow = screen.getByRole("listitem", { name: "young/pkg" });
    const dot = youngRow.querySelector(".age-scale-dot") as HTMLElement;

    // Assert: 4 / 12 === 33.33%, not the 40% a lone 4-year row's own max(10, ceil(4)) would give it.
    expect(dot.style.left).toBe(`${(4 / 12) * 100}%`);
  });

  it("shows the run's own thresholds once, above the list, rather than repeating them per row (PD-ROWS-3)", () => {
    // Arrange
    const finding = makeFinding({
      package: "scaled/pkg",
      verdict: "stale",
      signals: [makeSignal({ id: "S2", level: "high", data: { years: 8.7 } })],
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert: the run's own release-warn-years/release-high-years, named once. a11y review: the
    // visible line is a short, `aria-hidden` "y" form (the tick glyph replaced by a CSS-drawn bar,
    // `.age-scale-legend-tick`, not a text character a screen reader would read aloud); the line's
    // own accessible name — `role="img"`, the same pairing a row's own `AgeScale` already uses —
    // spells the unit out in full instead, found here by that role and name rather than by
    // `getByText` (which, by default, matches the visible `aria-hidden` span underneath, not the
    // named element itself).
    const legend = screen.getByRole("img", { name: "age scale: warn at 3 years, high at 5 years" });
    expect(legend.textContent).toBe("age scale: warn 3 y high 5 y");
  });

  it("shows no legend at all when nothing in the list would draw a scale (PD-ROWS-3)", () => {
    // Arrange: only S3, which never carries years — the same shape as the "draws no scale" test
    // below, but asserted against the list-level legend rather than one row's own scale.
    const finding = makeFinding({
      package: "unscaled/pkg",
      signals: [makeSignal({ id: "S3", level: "high", summary: "repository archived" })],
    });
    const model = modelWith([finding]);

    // Act
    renderIn(model, stateWith(), <FindingsView />);

    // Assert
    expect(screen.queryByText(/age scale:/)).toBeNull();
  });

  describe("contextOnly: a scale drawn for context, not for the verdict's own priority (PD-ROWS-3)", () => {
    // sensio/framework-extra-bundle's own shape: CRITICAL from S1 (abandoned), but its S2 sits in
    // the warn zone — the scale must not read as agreeing with a priority S1 alone decided.
    it("draws a neutral dot, not the zone's tone, for an abandoned finding", () => {
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
      const dot = row.querySelector(".age-scale-dot");
      const scale = within(row).getByRole("img");

      // Assert: neutral class, not the medium (warn-zone) tone this age would otherwise carry.
      expect(dot?.className).toContain("age-scale-dot-context");
      expect(dot?.className).not.toContain("tone-med");
      expect(scale.getAttribute("aria-label")).toContain("age shown for context");
      expect(scale.getAttribute("aria-label")).toContain("flagged for being marked abandoned");
    });

    it("draws a neutral dot for a pinned finding too", () => {
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
      const dot = row.querySelector(".age-scale-dot");
      const scale = within(row).getByRole("img");

      // Assert
      expect(dot?.className).toContain("age-scale-dot-context");
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
      const dot = row.querySelector(".age-scale-dot");

      // Assert
      expect(dot?.className).toContain("tone-crit");
      expect(dot?.className).not.toContain("age-scale-dot-context");
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
