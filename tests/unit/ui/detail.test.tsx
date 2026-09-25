import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalize } from "../../../src/model/normalize";
import type { Model, PackageDetails } from "../../../src/model/types";
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
const WALLABAG = loadModel("wallabag_wallabag.json");
const MAUTIC = loadModel("mautic_mautic.json");

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
    // PD-TIMELINE-5 (DESIGN.md §5): one branch name that is not a version ("master") sends the whole
    // list to date order; the EXTRA run records no thresholds, so no age takes a zone's tone.
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
            branch: "master",
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

    it("shows every rule as a sentence, applied or not, and the document's own final priority", () => {
      const { container } = renderDetail(MINI, "vendor/transitive");
      screen.getByText("Why this is high", { exact: false });
      const rows = Array.from(container.querySelectorAll(".detail-ladder-text")).map((el) => [
        el.textContent,
        el.classList.contains("is-applied")
          ? "applied"
          : el.classList.contains("is-quiet")
            ? "quiet"
            : "result",
      ]);
      expect(rows).toEqual([
        ["Abandoned packages start at critical.", "applied"],
        ["You don’t require it directly: one step down. It comes through vendor/direct.", "applied"],
        ["Needed in production: no step down.", "quiet"],
        ["No security advisory: no step up.", "quiet"],
        ["So: high.", "result"],
      ]);
      // Said in priority words, the track's own, not the verdict's.
      expect(container.querySelector(".detail-why-aside")?.textContent).toBe(
        "one rule moved it down from critical",
      );
      expect(container.querySelector(".detail-ladder-note")?.textContent).toBe(
        "It comes through vendor/direct.",
      );
      // One dot per row, on the rung the ladder is at: critical, then high for the rest.
      const dots = Array.from(container.querySelectorAll(".detail-ladder-dot")).map((el) =>
        Array.from(el.classList).find((c) => c.startsWith("at-")),
      );
      expect(dots).toEqual(["at-0", "at-1", "at-1", "at-1", "at-1"]);
    });

    it("clamps a step-up at critical instead of implying a level beyond it", () => {
      renderDetail(EXTRA_MODEL, "vendor/vulnerable");
      screen.getByText("Why this is critical", { exact: false });
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

  describe("checks (PD-DETAIL-12)", () => {
    function text(el: Element | null): string {
      return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    }

    it("draws all ten checks as a strip hidden from assistive tech, the tally saying it in words", () => {
      const { container } = renderDetail(WALLABAG, "sensio/framework-extra-bundle");
      expect(text(container.querySelector(".detail-checks-aside"))).toBe("5 of 10 fired");
      const strip = container.querySelector(".detail-strip");
      expect(strip?.getAttribute("aria-hidden")).toBe("true");
      expect(strip?.querySelectorAll("[tabindex], a, button").length).toBe(0);
      const cells = Array.from(container.querySelectorAll(".detail-check")).map(
        (el) =>
          `${el.textContent}:${["is-fired", "is-quiet", "is-blocked", "is-unreported"].find((c) => el.classList.contains(c))}`,
      );
      expect(cells).toEqual([
        "S1:is-fired",
        "S2:is-fired",
        "S3:is-fired",
        "S4:is-fired",
        "S5:is-quiet",
        "S6:is-quiet",
        "S7:is-fired",
        "S8:is-quiet",
        "S9:is-quiet",
        "S10:is-quiet",
      ]);
      expect(text(container.querySelector(".detail-checks-tally"))).toBe(
        "5 fired · 5 quiet · every check ran.",
      );
      // A quiet S10 says what its silence means, never "check could not run" under "every check ran".
      expect(text(container.querySelector(".detail-checks-line"))).toBe(
        "Quiet: S5 predates PHP · S6 snapshot · S8 branch stopped · S9 advisories · S10 every check ran",
      );
    });

    it("lists only the fired checks, high level first, each closed and opening onto its data", () => {
      const { container } = renderDetail(WALLABAG, "sensio/framework-extra-bundle");
      const rows = Array.from(container.querySelectorAll<HTMLDetailsElement>("details.detail-fired"));
      expect(rows.map((row) => row.querySelector(".detail-fired-id")?.textContent)).toEqual([
        "S1",
        "S3",
        "S2",
        "S4",
        "S7",
      ]);
      expect(rows.map((row) => row.querySelector(".detail-fired-level")?.textContent)).toEqual([
        "high",
        "high",
        "warn",
        "warn",
        "info",
      ]);
      expect(rows.every((row) => !row.open)).toBe(true);
      expect(rows[0]?.classList.contains("tone-crit")).toBe(true);
      expect(rows[2]?.classList.contains("tone-med")).toBe(true);
      // The docs link lives in the body, never inside the <summary> control.
      expect(rows[0]?.querySelector("summary a")).toBeNull();
      expect(rows[0]?.querySelector(".detail-fired-body a")?.textContent).toBe("S1 in lockrot’s docs");
    });

    it("names a check S10 stopped as could-not-run, with S10's reason, and never says every check ran", () => {
      const { container } = renderDetail(WALLABAG, "scheb/2fa-google-authenticator");
      expect(text(container.querySelector(".detail-checks-tally"))).toBe(
        "3 fired · 6 quiet · 1 could not run.",
      );
      const lines = Array.from(container.querySelectorAll(".detail-checks-line")).map(text);
      expect(lines).toEqual([
        "Could not run: S2 release age (undated releases, see S10)",
        "Quiet: S1 abandoned flag · S3 archived · S4 push age · S5 predates PHP · S6 snapshot · S9 advisories",
      ]);
      expect(container.querySelector(".detail-check.is-blocked")?.textContent).toBe("S2");
    });

    it("writes a list of objects in a signal's data one line per object, and a list of ids joined", () => {
      const { container } = renderDetail(WALLABAG, "scheb/2fa-google-authenticator");
      const s10 = Array.from(container.querySelectorAll("details.detail-fired")).find(
        (row) => row.querySelector(".detail-fired-id")?.textContent === "S10",
      );
      const values = Array.from(s10?.querySelectorAll(".detail-kv dd") ?? []).map(text);
      expect(values).toEqual(["check release_dates · reason undated_releases · blocks S2, S8", "S2, S8"]);
    });
  });

  describe("how it gets in (PD-DETAIL-6: the chain opens the panel, no longer a closed reference)", () => {
    it("shows composer.json for a direct finding", () => {
      const { container } = renderDetail(MINI, "vendor/direct");
      expect(container.querySelector(".detail-chain")?.textContent).toBe("composer.json›vendor/direct");
      expect(container.querySelector(".detail-chain .is-self")?.textContent).toBe("vendor/direct");
    });

    it("shows the full chain for a transitive finding, a flagged hop opening that package", () => {
      const { container, dispatch } = renderDetail(MINI, "vendor/transitive");
      expect(container.querySelector(".detail-chain")?.textContent).toBe(
        "composer.json›vendor/direct›vendor/transitive",
      );

      fireEvent.click(screen.getByRole("button", { name: "vendor/direct" }));
      expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "vendor/direct" });
    });

    it("lists what it pulls in from S7, each flagged package one click away", () => {
      const { container, dispatch } = renderDetail(MINI, "vendor/direct");
      const pulls = container.querySelector(".detail-pulls");
      expect(pulls?.textContent).toBe("vendor/transitive (abandoned)");
      fireEvent.click(screen.getByRole("button", { name: "vendor/transitive" }));
      expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "vendor/transitive" });
    });
  });

  describe("the answer and its key facts (PD-DETAIL-6)", () => {
    it("says what it is, how it gets in, and the four facts, in the lead above every section", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      const answer = container.querySelector(".detail-answer")?.textContent ?? "";
      expect(answer).toMatch(/^Left behind on /);
      expect(answer).toContain("You require it directly.");
      const labels = Array.from(container.querySelectorAll(".detail-facts dt")).map((el) => el.textContent);
      expect(labels.slice(0, 2)).toEqual(["Installed", "Last release"]);
      expect(labels).toContain("Libyears");
      const facts = container.querySelector(".detail-facts")?.textContent ?? "";
      expect(facts).toContain("4.7");
    });

    /** Each fact as [label, value, note?], in order. */
    function factRows(container: ParentNode): string[][] {
      return Array.from(container.querySelectorAll(".detail-fact")).map((fact) =>
        Array.from(fact.children).map((cell) => cell.textContent),
      );
    }

    it("quotes one age for a package with two ways in, and says whose release it is (evaluator: three ages, one screen)", () => {
      const { container } = renderDetail(WALLABAG, "hoa/event");
      const answer = container.querySelector(".detail-answer")?.textContent ?? "";
      // The answer quotes the fact's own age (S2, 9.1 years), not S4's 5.4, and both ways in.
      expect(answer).toBe(
        "Marked abandoned upstream and archived on GitHub; its last release was 9.1 years ago. It comes in through wallabag/rulerz and wallabag/rulerz-bundle.",
      );
      // That release is 2.x's, not the reader's 1.x — so the fact says so, and the release-branches
      // answer's 9.7 years for 1.x no longer reads as a third, unexplained age.
      expect(factRows(container)[1]).toEqual(["Last release", "9.1 y ago", "on 2.x, newer than yours"]);
      expect(container.querySelector(".detail-timeline-answer")?.textContent).toBe(
        "Your branch, 1.x, had its last release 9.7 years ago.",
      );
      // The ladder's reach rung names the same two ways in, and never says "only".
      const reach = container.querySelectorAll(".detail-ladder-text")[1]?.textContent ?? "";
      expect(reach).toBe(
        "You don’t require it directly: one step down. It comes through wallabag/rulerz and wallabag/rulerz-bundle.",
      );
    });

    it("always shows the same four facts, a gap said rather than left out", () => {
      const { container } = renderDetail(WALLABAG, "hoa/event");
      expect(factRows(container).map((row) => row[0])).toEqual([
        "Installed",
        "Last release",
        "Libyears",
        "PHP",
      ]);
      expect(factRows(container)[3]).toEqual(["PHP", "not recorded"]);
    });

    it("keeps one label in the release slot and puts whose release it is in the note (evaluator: four labels)", () => {
      // S8: the reader's own branch's last release, named under the value.
      const branch = factRows(renderDetail(KOEL, "predis/predis").container)[1];
      expect(branch?.[0]).toBe("Last release");
      expect(branch?.[2]).toMatch(/^on your \S+$/);
    });

    it("says a snapshot has no release in the same slot, under the same label", () => {
      const { container } = renderDetail(MAUTIC, "mautic/core-lib");
      const row = factRows(container)[1];
      expect(row?.slice(0, 2)).toEqual(["Last release", "none, a snapshot"]);
      if (row?.[2] !== undefined) expect(row[2]).toMatch(/^dated \d/);
    });

    it("glosses a libyears of 0.0 so it does not read as good news, and keeps an abandoned age in ink everywhere", () => {
      const { container } = renderDetail(WALLABAG, "sensio/framework-extra-bundle");
      expect(factRows(container)[2]).toEqual(["Libyears", "0.0", "nothing newer"]);
      // Abandoned never rests on age: ink in the answer, the fact and the release-branches answer alike.
      expect(container.querySelector(".detail-answer-figure.is-toned")).toBeNull();
      expect(container.querySelector(".detail-fact-toned")).toBeNull();
      expect(container.querySelector(".detail-timeline-age")?.classList.contains("is-toned")).toBe(false);
    });

    it("counts a long pulls-in list by verdict and names every package in its fold, never pointing elsewhere", () => {
      const { container, dispatch } = renderDetail(MAUTIC, "mautic/core-lib");
      const pulls = container.querySelector(".detail-pulls");
      expect(pulls?.textContent).not.toContain("S7 below");
      const fold = pulls?.querySelector("details.detail-pulls-all");
      expect(fold?.querySelector("summary")?.textContent).toBe("Name all 21");
      const named = Array.from(
        fold?.querySelectorAll(".detail-pulls-group dd .mono, .detail-pulls-group dd button") ?? [],
      );
      expect(named).toHaveLength(21);
      // Each group's count is its own names' count.
      for (const group of Array.from(fold?.querySelectorAll(".detail-pulls-group") ?? [])) {
        const n = Number(group.querySelector(".detail-pulls-n")?.textContent);
        expect(group.querySelectorAll("dd .mono, dd button")).toHaveLength(n);
      }
      const button = fold?.querySelector("button");
      if (button) {
        fireEvent.click(button);
        expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: button.textContent });
      }
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
    it("links a resolved package-name replacement to Packagist, in the answer sentence", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/replaced");
      expect(container.querySelector(".detail-answer")?.textContent).toContain(
        "Its named replacement is vendor/successor.",
      );
      const link = screen.getByRole("link", { name: "vendor/successor" });
      expect(link.getAttribute("href")).toBe("https://packagist.org/packages/vendor/successor");
    });

    it("shows Packagist's own free-text replacement as plain text, not a link (critic.md M32)", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/freetext-replacement");
      expect(screen.queryByRole("link", { name: "some/other-package" })).toBeNull();
      expect(container.querySelector(".detail-answer-replacement")?.textContent).toBe("some/other-package");
    });

    it("says a dev, transitive finding is both, in the answer and on its chain", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/freetext-replacement");
      expect(container.querySelector(".detail-answer")?.textContent).toContain(", for development only.");
      expect(container.querySelector(".detail-chain")?.textContent).toContain("require-dev");
    });
  });

  describe("advisories", () => {
    it("omits the section for a finding with no advisory", () => {
      renderDetail(MINI, "vendor/transitive");
      expect(screen.queryByRole("heading", { name: /security advisor/ })).toBeNull();
    });

    it("titles the section with the advisory count and lists the fix ladder", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/vulnerable");
      screen.getByRole("heading", { name: "2 security advisories" });

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
    /** The rendered timeline's own rows (header and axis excluded), as their row-header text. */
    function rowHeaders(container: ParentNode): string[] {
      return Array.from(container.querySelectorAll(".detail-timeline [role='rowheader']")).map(
        (cell) => cell.textContent,
      );
    }

    it("answers first: your branch and its age, then how many are newer and the newest's facts", () => {
      const { container } = renderDetail(KOEL, "meilisearch/meilisearch-php");
      screen.getByText("Release branches");
      const answer = container.querySelector(".detail-timeline-answer")?.textContent;
      const sub = container.querySelector(".detail-timeline-sub")?.textContent;
      expect(answer).toBe("Your branch, 0.24.x, had its last release 4.1 years ago.");
      expect(sub).toBe(
        "There are 4 newer branches. The newest is 1.x, released v1.17.0 on 2026-08-04 (7 weeks ago) and requires php ^7.4 || ^8.0.",
      );
      // The age takes the run's own warn..high tone (3 and 5 years): 4.1 is past warn, short of high.
      expect(container.querySelector(".detail-timeline-age")?.classList.contains("tone-med")).toBe(true);
    });

    it("draws newest version first, yours marked, the older ones in one fold that opens in place", () => {
      const { container } = renderDetail(KOEL, "meilisearch/meilisearch-php");
      expect(rowHeaders(container)).toEqual([
        "1.x, the newest",
        "0.27.x",
        "0.26.x",
        "0.25.x",
        "0.24.x, yours",
        "16 older branches",
      ]);
      expect(container.querySelector(".detail-timeline-row.is-mine")?.textContent).toContain("v0.24.2");

      const fold = screen.getByRole("button", { name: "16 older branches" });
      expect(fold.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(fold);
      expect(fold.getAttribute("aria-expanded")).toBe("true");
      expect(rowHeaders(container)).toHaveLength(6 + 16);
      expect(rowHeaders(container).at(-1)).toBe("0.8.x");
    });

    it("shows the raw php constraint as written, and no verdict about it", () => {
      const { container } = renderDetail(KOEL, "meilisearch/meilisearch-php");
      const php = Array.from(container.querySelectorAll(".detail-timeline-php")).map(
        (cell) => cell.textContent,
      );
      expect(php.slice(0, 5)).toEqual(Array(5).fill("^7.4 || ^8.0"));
      expect(container.querySelector(".detail-timeline")?.textContent).not.toMatch(/[✓✗]|allows/);
    });

    it("keeps the axis the same when a fold opens: the dots do not move", () => {
      const { container } = renderDetail(KOEL, "meilisearch/meilisearch-php");
      const mineX = (): string =>
        container
          .querySelector<HTMLElement>(".detail-timeline-row.is-mine .detail-timeline-strip")
          ?.style.getPropertyValue("--x") ?? "";
      const before = mineX();
      fireEvent.click(screen.getByRole("button", { name: "16 older branches" }));
      expect(before).not.toBe("");
      expect(mineX()).toBe(before);
    });

    it("a package without maintained branches: its version once, its release date in the third column (PD-TIMELINE-3)", () => {
      // daverandom/resume (koel_koel.json): each release is its own "branch" ("0.0.3"/"0.0.2"),
      // whose tag label only repeats it with a "v".
      const { container } = renderDetail(KOEL, "daverandom/resume");
      const timeline = container.querySelector(".detail-timeline");
      screen.getByText("Release history");
      expect(timeline?.textContent).not.toContain("v0.0.3");
      expect(timeline?.textContent).not.toContain("v0.0.2");
      expect(timeline?.textContent).toContain("2018-01-28");
      expect(timeline?.textContent).toContain("2017-09-26");
      expect(screen.queryByRole("columnheader", { name: "latest" })).toBeNull();
      // The same four columns as any branch table: the third says when each release came out.
      screen.getByRole("columnheader", { name: "released" });
      const third = Array.from(container.querySelectorAll(".detail-timeline-latest")).map(
        (cell) => cell.textContent,
      );
      expect(third).toEqual(["2018-01-28", "2017-09-26"]);
      expect(container.querySelector(".detail-timeline-answer")?.textContent).toBe(
        "You’re on the newest release, 0.0.3. It came out 8.7 years ago.",
      );
      expect(container.querySelector(".detail-timeline-sub")?.textContent).toBe(
        "Nothing newer has been released; the only other release, 0.0.2, is older.",
      );
    });

    it("keys only what this timeline draws: no newest marker when the reader is on it (PD-TIMELINE-4)", () => {
      const { container } = renderDetail(KOEL, "daverandom/resume");
      const key = container.querySelector(".detail-timeline-key")?.textContent ?? "";
      expect(key).toContain("you");
      expect(key).not.toContain("newest");
    });

    it("captions the threshold guides on the axis itself, warn and high apart by pattern (PD-TIMELINE-4)", () => {
      const { container } = renderDetail(KOEL, "meilisearch/meilisearch-php");
      const captions = Array.from(container.querySelectorAll(".detail-timeline-guide-cap"));
      // One fixed pattern at every width: just the years, "ago" said once in the key.
      expect(captions.map((cap) => cap.textContent)).toEqual(["3y", "5y"]);
      // The older guide's caption sits left of its line, the younger's right, so they never meet.
      expect(captions.map((cap) => cap.classList.contains("is-left"))).toEqual([false, true]);
      expect(container.querySelector(".detail-timeline-guide.is-warn")).not.toBeNull();
      expect(container.querySelector(".detail-timeline-guide.is-high")).not.toBeNull();
      // Out of the key: "┃3 ┃5 years ago" there read as a count. The key names what the captions
      // count, once and without a number.
      const key = container.querySelector(".detail-timeline-key")?.textContent ?? "";
      expect(key).not.toMatch(/\d/);
      expect(key).toContain("age limit, in years ago");
    });

    it("never tones a snapshot's age: a checkout date is not a release age", () => {
      // rector/rector (mautic_mautic.json): a dev-main snapshot seven weeks old.
      const { container } = renderDetail(loadModel("mautic_mautic.json"), "rector/rector");
      expect(container.querySelector(".detail-timeline-answer")?.textContent).toContain("dated 7 weeks ago");
      expect(container.querySelector(".detail-timeline-age")?.classList.contains("is-toned")).toBe(false);
      expect(
        container.querySelector(".detail-timeline-row.is-snapshot")?.classList.contains("is-toned"),
      ).toBe(false);
    });

    it("calls the first row the highest, not the newest, when a lower branch released after it", () => {
      // meilisearch-php with its 0.24.x (installed) moved to a release after 1.x's own.
      const details = KOEL.details.get("meilisearch/meilisearch-php");
      if (details?.metadata == null) throw new Error("meilisearch-php has no metadata");
      const branches = details.metadata.branches.map((branch) =>
        branch.branch === "0.24.x" ? { ...branch, highestReleased: "2026-09-01T00:00:00.000Z" } : branch,
      );
      const moved: PackageDetails = { ...details, metadata: { ...details.metadata, branches } };
      const model: Model = {
        ...KOEL,
        details: new Map([...KOEL.details, ["meilisearch/meilisearch-php", moved] as const]),
      };
      const { container } = renderDetail(model, "meilisearch/meilisearch-php");
      expect(container.querySelector(".detail-timeline-sub")?.textContent).toContain("The highest is 1.x");
      expect(container.querySelector(".detail-timeline-key")?.textContent).toContain("highest");
      expect(rowHeaders(container)[0]).toBe("1.x, the highest");
    });

    it("falls back to date order, and to no tone or guides, when the names or the thresholds are missing", () => {
      // vendor/edge-timeline: a "master" branch next to "1.x", and a run with no thresholds.
      const { container } = renderDetail(EXTRA_MODEL, "vendor/edge-timeline");
      expect(rowHeaders(container)).toEqual(["master, the newest", "1.x, yours"]);
      expect(screen.getByRole("table", { name: "Release branches, most recent release first" })).toBeTruthy();
      expect(container.querySelector(".detail-timeline-age")?.classList.contains("is-toned")).toBe(false);
      expect(container.querySelector(".detail-timeline-guide")).toBeNull();
      expect(container.querySelector(".detail-timeline-key")?.textContent).not.toContain("years ago");
      // No php constraint recorded: a dash on screen, words for a screen reader.
      expect(container.querySelector(".detail-timeline-php")?.textContent).toBe("—none recorded");
    });
  });

  describe("a fully-detailed real finding (predis/predis, koel_koel.json)", () => {
    it("renders the header's version, pills and outbound links", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      // Scoped to the pills row: "high" also appears as the bold result of "Why this is high"
      // further down the panel, and a page-wide text query would find both. The direct/transitive
      // tag moved into the answer sentence (PD-DETAIL-6), so the pills are the two words alone.
      const pills = container.querySelector(".detail-pills");
      expect(pills?.textContent).toContain("left-behind");
      expect(pills?.textContent).toContain("high");
      expect(pills?.querySelector(".tag")).toBeNull();
      expect(container.querySelector(".detail-version")?.textContent).toMatch(/^v?\d/);
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

    it("puts the answer and how it gets in first, then priority and the checks behind it, follow-the-upstream, release branches, and the two reference sections last", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      const order = markerOrder(container, [
        "Left behind on",
        "How it gets in",
        "Why this is high",
        "of 10 fired",
        "Follow the upstream",
        "Release branches",
        "The lock entry",
        "Provenance",
      ]);
      expect(order).not.toContain(-1);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("puts why this priority ahead of against the baseline, and both ahead of the reference sections", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/worsened");
      const order = markerOrder(container, ["Why this is medium", "The baseline recorded", "The lock entry"]);
      expect(order).not.toContain(-1);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("puts the checks ahead of every advisory, and both ahead of the reference sections (PD-DETAIL-12)", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/vulnerable");
      const order = markerOrder(container, ["of 10 fired", "Every advisory", "The lock entry"]);
      expect(order).not.toContain(-1);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("closes the two reference sections by default", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      const references = container.querySelectorAll<HTMLDetailsElement>("details.detail-reference");
      expect(references.length).toBe(2);
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
