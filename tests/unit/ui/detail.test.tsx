import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import type { Action, State } from "../../../src/state/types";
import { EMPTY_FILTERS } from "../../../src/state/types";
import { Detail } from "../../../src/ui/detail/Detail";
import { ReportContext } from "../../../src/ui/context";

const FIXTURES_DIR = join(process.cwd(), "fixtures", "bundles");

function loadModel(fixture: string): Model {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, fixture), "utf8")) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`fixture ${fixture} failed to normalize: ${result.error.message}`);
  return result.model;
}

const MINI = loadModel("mini.json");
const KOEL = loadModel("koel_koel.json");

/**
 * The findings the real fixtures don't carry an example of: security advisories, the three
 * baseline standings, and both shapes of "replacement" (a resolved package name vs. Packagist's own
 * free text). Still run through `normalize()`, same as a document read from disk.
 */
const EXTRA = normalize({
  report: {
    lockrot: { version: "0.11.0", schema: 1 },
    generated_at: "2026-01-01T00:00:00Z",
    baseline: { path: "baseline.json", known: 1, new: 1, worsened: 1, stale: [] },
    findings: [
      {
        package: "vendor/vulnerable",
        version: "1.0.0",
        verdict: "silent",
        priority: "critical",
        direct: true,
        dev: false,
        signals: [
          {
            id: "S9",
            level: "high",
            summary: "flagged by the advisory feed",
            data: {
              advisories: [
                {
                  id: "GHSA-1",
                  cve: "CVE-2024-0001",
                  title: "Remote code execution",
                  link: "https://example.com/ghsa-1",
                  severity: "critical",
                  reported_at: "2024-01-01T00:00:00Z",
                  fixed_by: null,
                  fixed_on_branch: false,
                },
                {
                  id: "GHSA-2",
                  cve: null,
                  title: "Denial of service",
                  link: null,
                  severity: "high",
                  reported_at: "2024-02-01T00:00:00Z",
                  fixed_by: "1.2.0",
                  fixed_on_branch: true,
                },
              ],
            },
          },
        ],
        chain: [],
        evidence: "no fix expected for GHSA-1",
      },
      {
        package: "vendor/newpkg",
        version: "1.0.0",
        verdict: "abandoned",
        priority: "critical",
        direct: true,
        dev: false,
        signals: [],
        chain: [],
        evidence: "",
        baseline: { status: "new" },
      },
      {
        package: "vendor/worsened",
        version: "1.0.0",
        verdict: "stale",
        priority: "medium",
        direct: true,
        dev: false,
        signals: [],
        chain: [],
        evidence: "",
        baseline: { status: "worsened", previous_verdict: "stale" },
      },
      {
        package: "vendor/replaced",
        version: "1.0.0",
        verdict: "abandoned",
        priority: "critical",
        direct: true,
        dev: false,
        replacement: "vendor/successor",
        signals: [],
        chain: [],
        evidence: "",
      },
      {
        package: "vendor/freetext-replacement",
        version: "1.0.0",
        verdict: "abandoned",
        priority: "high",
        direct: false,
        dev: true,
        signals: [],
        chain: ["vendor/root"],
        evidence: "",
      },
      {
        package: "vendor/edge-timeline",
        version: "1.x-dev",
        verdict: "left-behind",
        priority: "high",
        direct: true,
        dev: false,
        signals: [],
        chain: [],
        evidence: "",
      },
      {
        package: "vendor/no-suggestion",
        version: "1.0.0",
        verdict: "left-behind",
        priority: "high",
        direct: true,
        dev: false,
        signals: [{ id: "S8", level: "warn", summary: "left behind", data: {} }],
        chain: [],
        evidence: "",
      },
      {
        package: "vendor/empty-lock-strings",
        version: "1.0.0",
        verdict: "stale",
        priority: "medium",
        direct: true,
        dev: false,
        signals: [],
        chain: [],
        evidence: "",
      },
      {
        package: "vendor/raw-severity",
        version: "1.0.0",
        verdict: "stale",
        priority: "medium",
        direct: true,
        dev: false,
        signals: [
          {
            id: "S9",
            level: "warn",
            summary: "1 advisory",
            data: {
              advisories: [
                {
                  id: "GHSA-raw",
                  cve: null,
                  title: "Raw severity text",
                  link: null,
                  // DESIGN.md §5 M1: normalizeSeverity buckets this as "medium" for tone/sort, but
                  // the chip must show the feed's own text, not the bucket.
                  severity: "Moderate",
                  reported_at: null,
                  fixed_by: null,
                  fixed_on_branch: false,
                },
              ],
            },
          },
        ],
        chain: [],
        evidence: "",
      },
    ],
  },
  details: {
    // PD-TIMELINE-1: `min` (the oldest dated branch) sits on the last day of 2020, so the year
    // axis's first tick (2020's own Jan 1) plots well left of it — a large, unambiguous negative
    // `x`, not a borderline one, so the clamp this fixture exercises can't pass by accident.
    "vendor/edge-timeline": {
      metadata: {
        branches: [
          {
            branch: "1.x",
            installed: true,
            highest: "v1.0.0",
            highest_released: "2020-12-31T00:00:00.000Z",
            highest_commit_date: null,
            newest_dated: null,
            newest_dated_released: null,
            dated_by: null,
            php: null,
          },
          {
            branch: "2.x",
            installed: false,
            highest: "v2.0.0",
            highest_released: "2021-12-31T00:00:00.000Z",
            highest_commit_date: null,
            newest_dated: null,
            newest_dated_released: null,
            dated_by: null,
            php: null,
          },
        ],
      },
    },
    "vendor/freetext-replacement": { metadata: { replacement: "some/other-package" } },
    "vendor/empty-lock-strings": {
      // KeyValue.tsx's `presentRows` used to keep an empty-string value, and Detail.tsx's own
      // `lock?.type ?? metadata?.type ?? null` used `??`, which "" satisfies (it is not
      // null/undefined) — so an empty lock string used to render as a blank row instead of falling
      // back to metadata, unlike legacy's truthiness checks (report.js:766, 768-769).
      lock: { php: "", type: "" },
      metadata: { type: "library" },
    },
  },
});
if (!EXTRA.ok) throw new Error("EXTRA fixture failed to normalize");
const EXTRA_MODEL = EXTRA.model;

/**
 * Opens the reference `<details>` (PD-DETAIL-1: how it is reached, the lock entry and provenance
 * are closed by default) titled `heading` — found by its `<summary>` text rather than position,
 * since more than one reference section exists per finding — and returns the element itself so a
 * caller can read whatever it protects.
 */
function openReference(container: ParentNode, heading: string): HTMLDetailsElement | null {
  const summary = Array.from(container.querySelectorAll(".detail-reference-summary")).find(
    (el) => el.textContent === heading,
  );
  const section = (summary?.closest("details.detail-reference") as HTMLDetailsElement | null) ?? null;
  if (section) section.open = true;

  return section;
}

/**
 * The `<dl class="detail-kv">` under the reference section titled `heading`, opened first — a
 * finding with a signal has an *earlier* `dl.detail-kv` of its own (the signal's own data dump),
 * which a plain `querySelectorAll(...)[n]` would pick up instead of this one.
 */
function sectionKeyValue(container: ParentNode, heading: string): Element | null {
  return openReference(container, heading)?.querySelector("dl.detail-kv") ?? null;
}

/** `stateOverrides` lets a caller open the panel under a search term or a rail filter already in
 *  force — PD-DETAIL-4's own tests need that — without every other test naming every field. The
 *  render's own `dispatch` mock comes back too, so a test can assert what a click sent it. */
function renderDetail(
  model: Model,
  pkg: string | null,
  onClose: () => void = vi.fn(),
  stateOverrides: Partial<State> = {},
) {
  const state: State = {
    view: "findings",
    q: "",
    pkg,
    pkgAuto: false,
    sort: "verdict",
    sortDesc: false,
    filters: EMPTY_FILTERS,
    ...stateOverrides,
  };
  const dispatch: (action: Action) => void = vi.fn();
  const now = new Date(model.report.generatedAt);

  const result = render(
    <ReportContext.Provider
      value={{ model, state, dispatch, now, wide: true, openGlossary: vi.fn(), openGlossaryFrom: vi.fn() }}
    >
      <Detail onClose={onClose} />
    </ReportContext.Provider>,
  );
  return { ...result, dispatch };
}

describe("Detail", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when no package is open", () => {
    const { container } = renderDetail(MINI, null);
    expect(container.childNodes.length).toBe(0);
  });

  it("shows a not-in-report panel for an unknown package and closes it (M13)", () => {
    const onClose = vi.fn();
    renderDetail(MINI, "vendor/does-not-exist", onClose);

    const region = screen.getByRole("complementary", { name: "vendor/does-not-exist" });
    expect(region.textContent).toContain("vendor/does-not-exist is not in this report.");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("exposes the panel as a region named after the open package", () => {
    renderDetail(MINI, "vendor/transitive");
    expect(screen.getByRole("complementary", { name: "vendor/transitive" })).toBeTruthy();
  });

  describe("critic.md C6 — the lock entry and provenance always render", () => {
    it("shows only the guaranteed rows for a package with no details entry at all", () => {
      const { container } = renderDetail(MINI, "private/thing");

      const lockEntry = sectionKeyValue(container, "The lock entry");
      const provenance = sectionKeyValue(container, "Provenance");
      expect(lockEntry?.textContent).toContain("installed");
      expect(lockEntry?.textContent).toContain("3.0.0");
      expect(lockEntry?.querySelectorAll("dt").length).toBe(2); // installed, libyears behind — nothing else
      expect(lockEntry?.textContent).toContain("not measured");
      expect(lockEntry?.textContent).toContain("not from a Composer repository");

      expect(provenance?.querySelectorAll("dt").length).toBe(1); // metadata only
      expect(provenance?.textContent).toContain("—");
    });

    it("drops an empty-string lock value and falls back to metadata, like legacy's truthiness checks", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/empty-lock-strings");

      const lockEntry = sectionKeyValue(container, "The lock entry");
      // "php constraint" (empty string) is dropped entirely, not shown as a blank row.
      expect(lockEntry?.textContent).not.toContain("php constraint");
      // "type" (empty string in the lock) falls back to metadata's "library", not a blank dd.
      expect(lockEntry?.textContent).toContain("library");
    });

    it("links the repository when the producer's own link is safe, from a real details entry", () => {
      renderDetail(MINI, "vendor/transitive");
      const link = screen.getAllByRole("link", { name: "https://github.com/vendor/transitive" });
      expect(link.length).toBeGreaterThan(0);
    });
  });

  describe("priority ladder", () => {
    it("omits the section for a priority of none", () => {
      renderDetail(MINI, "vendor/direct");
      expect(screen.queryByText(/^Why this is/)).toBeNull();
    });

    it("shows the steps, as plain sentences, and the document's own final priority", () => {
      renderDetail(MINI, "vendor/transitive");
      screen.getByText("Why this is high");
      expect(screen.getByText("Abandoned packages start at critical.")).toBeTruthy();
      expect(screen.getByText("Only reached through another package: one step down.")).toBeTruthy();
      screen.getByText("So:", { exact: false });
      expect(screen.getByText("high", { selector: ".detail-why-result b" })).toBeTruthy();
    });

    it("clamps a step-up at critical instead of implying a level beyond it", () => {
      renderDetail(EXTRA_MODEL, "vendor/vulnerable");
      screen.getByText("Why this is critical");
      expect(screen.getByText("An advisory with no fix coming: one step up.")).toBeTruthy();
    });
  });

  describe("signals", () => {
    it("dumps a signal's data as key/value pairs, a null value spelled out", () => {
      renderDetail(MINI, "vendor/transitive");
      const summary = screen.getByText("marked abandoned in composer.lock");
      const details = summary.closest("details");
      expect(details).toBeTruthy();
      expect(details?.querySelector("dt")?.textContent).toBe("replacement");
      expect(details?.querySelector("dd")?.textContent).toBe("null");
    });

    it("shows the no-signal-fired line for a finding with none", () => {
      renderDetail(EXTRA_MODEL, "vendor/newpkg");
      expect(
        screen.getByText("No signal fired. The verdict comes from what lockrot could not learn."),
      ).toBeTruthy();
    });
  });

  describe("how it is reached", () => {
    it("shows composer.json for a direct finding, ignoring any chain field", () => {
      const { container } = renderDetail(MINI, "vendor/direct");
      openReference(container, "How it is reached");
      expect(container.querySelector(".detail-chain")?.textContent).toBe("composer.json → vendor/direct");
    });

    it("shows the full chain for a transitive finding", () => {
      const { container } = renderDetail(MINI, "vendor/transitive");
      openReference(container, "How it is reached");
      expect(container.querySelector(".detail-chain")?.textContent).toBe("vendor/direct → vendor/transitive");
    });
  });

  describe("against the baseline", () => {
    it("omits the section when the finding carries no baseline entry", () => {
      renderDetail(MINI, "vendor/transitive");
      expect(screen.queryByText("Against the baseline")).toBeNull();
    });

    it("says a finding is new since the baseline was written", () => {
      renderDetail(EXTRA_MODEL, "vendor/newpkg");
      expect(screen.getByText("Not in baseline.json. This one is new since it was written.")).toBeTruthy();
    });

    it("names the previous verdict for a worsened finding", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/worsened");
      const paragraph = container.querySelector(".detail-baseline");
      expect(paragraph?.textContent).toBe("The baseline recorded stale. It has got worse since.");
      expect(paragraph?.querySelector(".mono")?.textContent).toBe("stale");
    });
  });

  describe("replacement", () => {
    it("links a resolved package-name replacement to Packagist", () => {
      renderDetail(EXTRA_MODEL, "vendor/replaced");
      const link = screen.getByRole("link", { name: "replacement: vendor/successor" });
      expect(link.getAttribute("href")).toBe("https://packagist.org/packages/vendor/successor");
    });

    it("shows Packagist's own free-text replacement as plain text, not a link (critic.md M32)", () => {
      renderDetail(EXTRA_MODEL, "vendor/freetext-replacement");
      expect(screen.queryByRole("link", { name: /replacement:/ })).toBeNull();
      expect(screen.getByText("replacement: some/other-package")).toBeTruthy();
    });

    it("shows the require-dev and transitive tags for a dev, transitive finding", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/freetext-replacement");
      expect(container.textContent).toContain("transitive");
      expect(container.textContent).toContain("require-dev");
    });
  });

  describe("advisories", () => {
    it("omits the section for a finding with no advisory", () => {
      renderDetail(MINI, "vendor/transitive");
      expect(screen.queryByText(/security advisor/)).toBeNull();
    });

    it("titles the section with the advisory count and lists the fix ladder", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/vulnerable");
      screen.getByText("2 security advisories");

      const rungs = container.querySelectorAll(".detail-rung");
      expect(rungs.length).toBe(2);
      expect(rungs[0]?.classList.contains("detail-rung-here")).toBe(true); // the on-branch fix sorts first
      expect(rungs[0]?.textContent).toContain("1.2.0");
      expect(rungs[1]?.textContent).toContain("no release");
    });

    it("lists every advisory with its severity, CVE link and fix state", () => {
      renderDetail(EXTRA_MODEL, "vendor/vulnerable");
      fireEvent.click(screen.getByText("Every advisory"));

      const cveLink = screen.getByRole("link", { name: "CVE-2024-0001" });
      expect(cveLink.getAttribute("href")).toBe("https://nvd.nist.gov/vuln/detail/CVE-2024-0001");
      expect(screen.getByText("no fix listed")).toBeTruthy();
      expect(screen.getByText("fixed by 1.2.0")).toBeTruthy();
    });

    it("shows the feed's raw severity text in the chip, not the normalised bucket (DESIGN.md §5 M1)", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/raw-severity");
      fireEvent.click(screen.getByText("Every advisory"));

      const chip = container.querySelector(".detail-advisory-sev");
      expect(chip?.textContent).toBe("Moderate");
      expect(chip?.textContent).not.toBe("medium");
    });
  });

  describe("follow the upstream", () => {
    it("is absent when the S8 signal offers no usable suggestion", () => {
      renderDetail(EXTRA_MODEL, "vendor/no-suggestion");
      expect(screen.queryByText("Follow the upstream")).toBeNull();
    });

    it("shows the composer command and copies it to the clipboard", async () => {
      vi.useFakeTimers();
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });

      renderDetail(KOEL, "predis/predis");
      screen.getByText("Follow the upstream");
      screen.getByText("composer require predis/predis '^3.6'");

      const button = screen.getByRole("button", { name: "Copy" });
      fireEvent.click(button);
      expect(writeText).toHaveBeenCalledWith("composer require predis/predis '^3.6'");

      // Resolve the microtask the mocked promise scheduled, then advance past the revert timer.
      // `advanceTimersByTimeAsync` (not the sync form) is what lets Preact's own re-render — queued
      // as a microtask when the timer's `setLabel("Copy")` runs — actually flush before the assertion.
      await Promise.resolve();
      await Promise.resolve();
      screen.getByRole("button", { name: "Copied" });
      await vi.advanceTimersByTimeAsync(1400);
      screen.getByRole("button", { name: "Copy" });

      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("falls back to 'Select it and copy' when the Clipboard API is unavailable", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("navigator", {});

      renderDetail(KOEL, "predis/predis");
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
      screen.getByRole("button", { name: "Select it and copy" });
      await vi.advanceTimersByTimeAsync(2600);
      screen.getByRole("button", { name: "Copy" });

      vi.useRealTimers();
      vi.unstubAllGlobals();
    });
  });

  describe("release branches", () => {
    it("draws a lane per dated branch with the installed one marked", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      screen.getByText("Release branches");
      for (const branch of ["3.x", "2.x", "1.x", "0.8.x", "0.7.x"]) {
        expect(screen.getAllByText(branch).length).toBeGreaterThan(0);
      }
      expect(container.querySelector(".detail-timeline-lane-installed")).toBeTruthy();
      expect(container.querySelector(".detail-timeline-lane-newest")).toBeTruthy();
      expect(screen.getByText(/you are on v1\.1\.10/)).toBeTruthy();
      // Both legend facts apply here — an installed branch that is not the newest one — so both show.
      const legend = container.querySelector(".detail-timeline-legend");
      expect(legend?.textContent).toContain("branch still releasing");
    });

    it("clamps a first tick that plots left of the axis and drops its centering transform (PD-TIMELINE-1, DESIGN.md §5)", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/edge-timeline");
      const ticks = Array.from(container.querySelectorAll<HTMLElement>(".detail-timeline-tick"));
      expect(ticks.length).toBeGreaterThan(1);

      const first = ticks[0];
      expect(first?.classList.contains("detail-timeline-tick-first")).toBe(true);
      // The un-clamped `x` is well negative (this fixture's own doc comment); clamped to the axis's
      // own left edge instead of running off it.
      expect(parseFloat(first?.style.left ?? "-1")).toBe(0);

      for (const tick of ticks.slice(1)) {
        expect(tick.classList.contains("detail-timeline-tick-first")).toBe(false);
      }
    });

    it("shows a branch's own version once, not repeated with a bare 'v' prefix (PD-TIMELINE-3, DESIGN.md §5)", () => {
      // daverandom/resume (koel_koel.json): no maintained branches, so each release is its own
      // "branch" named "0.0.3"/"0.0.2" — the tag label datedTag reads off the same release repeats
      // it back as "v0.0.3"/"v0.0.2".
      const { container } = renderDetail(KOEL, "daverandom/resume");
      const timeline = container.querySelector(".detail-timeline");
      expect(timeline?.textContent).not.toContain("v0.0.3");
      expect(timeline?.textContent).not.toContain("v0.0.2");
      expect(timeline?.textContent).toContain("0.0.3");
      expect(timeline?.textContent).toContain("2018-01-28");
      expect(timeline?.textContent).toContain("0.0.2");
      expect(timeline?.textContent).toContain("2017-09-26");
    });

    it("shows only the legend entries a state this branch set actually has (PD-TIMELINE-4, DESIGN.md §5)", () => {
      // Both of daverandom/resume's dated branches are its own past releases: the newest one is also
      // the installed one, so nothing here is "still releasing" on a branch the reader has moved off.
      const { container } = renderDetail(KOEL, "daverandom/resume");
      const legend = container.querySelector(".detail-timeline-legend");
      expect(legend?.textContent).toContain("you are on v0.0.3");
      expect(legend?.textContent).not.toContain("branch still releasing");
    });
  });

  describe("a fully-detailed real finding (predis/predis, koel_koel.json)", () => {
    it("renders the header's pills, tags and outbound links", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      // Scoped to the pills row: "high" also appears as the bold result of "Why this is high"
      // further down the panel, and a page-wide text query would find both.
      const pills = container.querySelector(".detail-pills");
      expect(pills?.textContent).toContain("left-behind");
      expect(pills?.textContent).toContain("high");
      expect(pills?.textContent).toContain("direct");
      expect(screen.getByRole("link", { name: "packagist" }).getAttribute("href")).toBe(
        "https://packagist.org/packages/predis/predis",
      );
      expect(screen.getByRole("link", { name: "github.com" }).getAttribute("href")).toBe(
        "https://github.com/predis/predis",
      );
    });

    it("shows the measured libyears row with what it is measured against", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      const lockEntry = sectionKeyValue(container, "The lock entry");
      expect(lockEntry?.textContent).toContain("4.7");
      expect(lockEntry?.textContent).toContain("newest v3.6.1 released");
      expect(lockEntry?.textContent).toContain("2026-09-17");
    });

    it("shows provenance from the explain metadata", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      // Scoped to the Provenance section's own list: "v3.6.1" also labels a lane in the release
      // timeline above it, so a page-wide text query would find both.
      const provenance = sectionKeyValue(container, "Provenance");
      expect(provenance?.textContent).toContain("releases listed");
      expect(provenance?.textContent).toContain("58");
      expect(provenance?.textContent).toContain("last stable");
      expect(provenance?.textContent).toContain("v3.6.1");
    });
  });

  describe("section order (PD-DETAIL-1, DESIGN.md §8)", () => {
    /** Where each marker's text first appears in the rendered panel, in the order given — a
     *  closed reference section's text is still in `textContent` (CSS `display: none` on a
     *  closed `<details>`'s children does not remove them from the DOM), so this needs no click. */
    function markerOrder(container: ParentNode, markers: readonly string[]): number[] {
      const text = container.textContent ?? "";
      return markers.map((marker) => text.indexOf(marker));
    }

    it("puts follow-the-upstream right after the header, then priority, release branches, signals, and the three reference sections last", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      const order = markerOrder(container, [
        "Follow the upstream",
        "Why this is high",
        "Release branches",
        "Signals — what was observed",
        "How it is reached",
        "The lock entry",
        "Provenance",
      ]);
      expect(order).not.toContain(-1);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("puts against the baseline ahead of why this priority and the reference sections", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/worsened");
      const order = markerOrder(container, [
        "The baseline recorded",
        "Why this is medium",
        "How it is reached",
      ]);
      expect(order).not.toContain(-1);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("puts every advisory ahead of signals and the reference sections", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/vulnerable");
      const order = markerOrder(container, [
        "2 security advisories",
        "Signals — what was observed",
        "How it is reached",
      ]);
      expect(order).not.toContain(-1);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("closes the three reference sections by default", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      const references = container.querySelectorAll<HTMLDetailsElement>("details.detail-reference");
      expect(references.length).toBe(3);
      for (const reference of references) {
        expect(reference.open).toBe(false);
      }
    });

    it("opens a reference section on its summary and reveals what it protects", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      const lockEntry = openReference(container, "The lock entry");
      expect(lockEntry?.open).toBe(true);
      expect(lockEntry?.querySelector("dl.detail-kv")?.textContent).toContain("installed");
    });
  });

  describe("PD-DETAIL-4 (DESIGN.md §5): hidden by the current filters", () => {
    it("says nothing when the open package matches the current filters", () => {
      const { container } = renderDetail(MINI, "vendor/transitive");
      expect(container.querySelector(".detail-hidden-note")).toBeNull();
    });

    it("shows a factual line, with a control that clears the filters, when a search term hides it from its own tab", () => {
      const { container, dispatch } = renderDetail(MINI, "vendor/transitive", vi.fn(), {
        q: "no-such-package",
      });

      const note = container.querySelector(".detail-hidden-note");
      expect(note?.textContent).toContain("Hidden by the current filters.");

      fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(dispatch).toHaveBeenCalledWith({ type: "clear" });
    });

    // a11y/regression review: "Clear filters" used to leave focus nowhere once clicked — `hidden`
    // turns false in the same dispatch and unmounts the very button the click landed on, dropping
    // keyboard focus to `<body>` (WCAG 2.4.3). It now moves focus to the panel's own Close button,
    // which is mounted whether or not the note is shown.
    it("moves focus to the panel's own Close button once clicked", () => {
      const { container } = renderDetail(MINI, "vendor/transitive", vi.fn(), { q: "no-such-package" });

      fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

      const close = container.querySelector(".detail-close");
      expect(close).not.toBeNull();
      expect(document.activeElement).toBe(close);
    });

    it("shows the line when a rail filter, not the search box, is what hides it", () => {
      const { container } = renderDetail(MINI, "vendor/transitive", vi.fn(), {
        filters: { ...EMPTY_FILTERS, verdict: ["pinned"] },
      });
      expect(container.querySelector(".detail-hidden-note")).toBeTruthy();
    });

    it("says nothing for a package the current tab never lists at all, not simply filtered out of it", () => {
      // private/thing is "finished" — never part of the Findings tab's flagged population
      // regardless of any filter, a different fact than PD-DETAIL-4's own.
      const { container } = renderDetail(MINI, "private/thing");
      expect(container.querySelector(".detail-hidden-note")).toBeNull();
    });
  });
});
