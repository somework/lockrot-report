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
 * The `<dl class="detail-kv">` under the section titled `heading` — found by heading text rather
 * than position, since a finding with a signal has an *earlier* `dl.detail-kv` of its own (the
 * signal's own data dump), which a plain `querySelectorAll(...)[n]` would pick up instead.
 */
function sectionKeyValue(container: ParentNode, heading: string): Element | null {
  const match = Array.from(container.querySelectorAll("h3")).find((h) => h.textContent === heading);
  return match?.closest(".detail-section")?.querySelector("dl.detail-kv") ?? null;
}

function renderDetail(model: Model, pkg: string | null, onClose: () => void = vi.fn()) {
  const state: State = {
    view: "findings",
    q: "",
    pkg,
    pkgAuto: false,
    sort: "verdict",
    sortDesc: false,
    filters: EMPTY_FILTERS,
  };
  const dispatch: (action: Action) => void = vi.fn();
  const now = new Date(model.report.generatedAt);

  return render(
    <ReportContext.Provider value={{ model, state, dispatch, now, wide: true }}>
      <Detail onClose={onClose} />
    </ReportContext.Provider>,
  );
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

    it("shows the steps and the document's own final priority", () => {
      renderDetail(MINI, "vendor/transitive");
      screen.getByText("Why this is high");
      expect(screen.getByText("abandoned starts at critical")).toBeTruthy();
      expect(screen.getByText("nothing requires it directly, one step down")).toBeTruthy();
    });

    it("clamps a step-up at critical instead of implying a level beyond it", () => {
      renderDetail(EXTRA_MODEL, "vendor/vulnerable");
      screen.getByText("Why this is critical");
      expect(screen.getByText("an advisory no release will fix, one step up")).toBeTruthy();
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
      expect(container.querySelector(".detail-chain")?.textContent).toBe("composer.json → vendor/direct");
    });

    it("shows the full chain for a transitive finding", () => {
      const { container } = renderDetail(MINI, "vendor/transitive");
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
});
