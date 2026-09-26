import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalize } from "../../../src/model/normalize";
import type { Model, PackageDetails } from "../../../src/model/types";
import type { Action, State } from "../../../src/state/types";
import { EMPTY_FILTERS } from "../../../src/state/types";
import { Detail } from "../../../src/ui/detail/Detail";
import { ReportContext } from "../../../src/ui/context";

/** Evidence is scrolled to and focused a frame after its `<details>` open (SignalList.tsx#reveal). */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

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
        package: "vendor/known",
        version: "1.0.0",
        verdict: "stale",
        priority: "low",
        direct: false,
        dev: false,
        signals: [],
        chain: ["vendor/root"],
        evidence: "",
        baseline: { status: "known", previous_verdict: "left-behind" },
      },
      {
        package: "vendor/worsened",
        version: "1.0.0",
        verdict: "left-behind",
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
    sort: "verdict",
    sortDesc: false,
    filters: EMPTY_FILTERS,
    disclosure: {},
    ...stateOverrides,
  };
  const dispatch: (action: Action) => void = vi.fn();
  const now = new Date(model.report.generatedAt);

  const result = render(
    <ReportContext.Provider
      value={{
        model,
        state,
        dispatch,
        now,
        wide: true,
        cursor: null,
        openGlossary: vi.fn(),
        openGlossaryFrom: vi.fn(),
      }}
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
      const provenance = openReference(container, "Provenance");
      expect(lockEntry?.textContent).toContain("installed");
      expect(lockEntry?.textContent).toContain("3.0.0");
      expect(lockEntry?.querySelectorAll("dt").length).toBe(2); // installed, libyears behind — nothing else
      expect(lockEntry?.textContent).toContain("not measured");
      expect(lockEntry?.textContent).toContain("not from a Composer repository");

      // PD-RUN-5: no bare dash — each source says why this file gives nothing for it.
      expect(provenance?.querySelectorAll("dt").length ?? 0).toBe(0);
      expect(provenance?.textContent).not.toContain("—");
      expect(
        Array.from(provenance?.querySelectorAll(".detail-prov-reason") ?? [], (el) => el.textContent),
      ).toEqual(["not in this document for this package"]);
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
    it("dumps a signal's data as key/value pairs, a null value a muted dash that still says null", () => {
      renderDetail(MINI, "vendor/transitive");
      const summary = screen.getByText("marked abandoned in composer.lock");
      const details = summary.closest("details");
      expect(details).toBeTruthy();
      expect(details?.querySelector("dl.detail-data dt")?.textContent).toBe("replacement");
      const dd = details?.querySelector("dl.detail-data dd");
      expect(dd?.querySelector('.detail-data-null [aria-hidden="true"]')?.textContent).toBe("—");
      expect(dd?.querySelector(".detail-data-null .detail-sr")?.textContent).toBe("null");
    });

    it("gives a flagged finding with no signal no reason it cannot back", () => {
      // vendor/newpkg: abandoned, and no signal at all.
      renderDetail(EXTRA_MODEL, "vendor/newpkg");
      expect(screen.getByText("No signal fired.")).toBeTruthy();
      expect(screen.queryByText(/could not learn/)).toBeNull();
    });

    it("says an ok package's checks all ran, a finished one's verdict comes from the allowlist, and only unknown lacks data", () => {
      const quiet = (pkg: string, verdict: string) => ({
        package: pkg,
        version: "1.0.0",
        verdict,
        priority: "none",
        direct: true,
        dev: false,
        signals: [],
        chain: [],
        evidence: "",
      });
      const result = normalize({
        report: {
          lockrot: { version: "0.13.0", schema: 1 },
          generated_at: "2026-01-01T00:00:00Z",
          findings: [
            quiet("vendor/fine", "ok"),
            { ...quiet("vendor/done", "finished"), allowlist_reason: "complete by design" },
            quiet("vendor/gone", "unknown"),
          ],
        },
      });
      if (!result.ok) throw new Error("fixture failed to normalize");
      const { model } = result;

      const ok = renderDetail(model, "vendor/fine");
      expect(screen.getByText("No signal fired: every check ran and found nothing.")).toBeTruthy();
      expect(screen.queryByText(/could not learn/)).toBeNull();
      ok.unmount();

      const finished = renderDetail(model, "vendor/done");
      expect(screen.getByText("No signal fired. The verdict comes from the allowlist.")).toBeTruthy();
      expect(
        screen.getByText("On the allowlist as finished, so it is not flagged: complete by design.", {
          exact: false,
        }),
      ).toBeTruthy();
      finished.unmount();

      renderDetail(model, "vendor/gone");
      expect(
        screen.getByText("No signal fired. The verdict comes from what lockrot could not learn."),
      ).toBeTruthy();
    });
  });

  describe("checks (PD-DETAIL-12)", () => {
    function text(el: Element | null): string {
      return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    }

    it("draws all ten checks as a strip, the tally saying it in words, the cells with evidence as buttons", () => {
      const { container } = renderDetail(WALLABAG, "sensio/framework-extra-bundle");
      // The count is said once, by the tally, not again beside the heading.
      expect(text(container.querySelector(".detail-checks > h3"))).toBe("Checks");
      const strip = container.querySelector(".detail-strip");
      // PD-RUN-5: the five fired cells point at their rows; the quiet ones, with nothing to show,
      // stay hidden from assistive tech (S3 and S4 fired here, so no quiet cell reaches Provenance).
      expect(strip?.getAttribute("role")).toBe("group");
      expect(
        Array.from(strip?.querySelectorAll("button") ?? [], (b) => b.getAttribute("aria-label")),
      ).toEqual([
        "S1 abandoned, fired: show the evidence",
        "S2 release age, fired: show the evidence",
        "S3 archived, fired: show the evidence",
        "S4 push age, fired: show the evidence",
        "S7 flagged deps, fired: show the evidence",
      ]);
      expect(strip?.querySelectorAll('span.detail-check[aria-hidden="true"]').length).toBe(5);
      const cells = Array.from(container.querySelectorAll(".detail-check")).map(
        (el) =>
          `${el.querySelector(".detail-check-id")?.textContent}:${["is-fired", "is-quiet", "is-blocked", "is-unreported"].find((c) => el.classList.contains(c))}`,
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
      // A quiet S10 says what its silence means, never "check gaps" under "every check ran". The
      // line reads each name to a screen reader (the strip is hidden from it)…
      expect(text(container.querySelector(".detail-checks-line"))).toBe(
        "Quiet: S5 predates PHP · S6 snapshot · S8 branch stopped · S9 advisories · S10 all checks ran",
      );
      // …but shows only the ids, since the strip right above names every check already.
      const line = container.querySelector(".detail-checks-line");
      expect(Array.from(line?.querySelectorAll(".detail-checks-id") ?? [], (el) => el.textContent)).toEqual([
        "S5",
        "S6",
        "S8",
        "S9",
        "S10",
      ]);
      expect(Array.from(line?.querySelectorAll(".detail-sr") ?? [], text)).toEqual([
        "predates PHP",
        "snapshot",
        "branch stopped",
        "advisories",
        "all checks ran",
      ]);
      // Each cell names its check under its id, S10's quiet cell included.
      const names = Array.from(container.querySelectorAll(".detail-check-name"), (el) => el.textContent);
      expect(names.slice(0, 3)).toEqual(["abandoned", "release age", "archived"]);
      expect(names[9]).toBe("all checks ran");
      // Each item is one unbreakable span carrying the separator after it, so a wrapped line never
      // starts on "·"; the last item has none.
      expect(Array.from(line?.querySelectorAll(".detail-checks-item") ?? [], text)).toEqual([
        "S5 predates PHP ·",
        "S6 snapshot ·",
        "S8 branch stopped ·",
        "S9 advisories ·",
        "S10 all checks ran",
      ]);
      expect(line?.querySelector(".detail-checks-item")?.textContent).toMatch(/\u00a0·$/);
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
        "Quiet: S1 abandoned · S3 archived · S4 push age · S5 predates PHP · S6 snapshot · S9 advisories",
      ]);
      expect(container.querySelector(".detail-check.is-blocked .detail-check-id")?.textContent).toBe("S2");
      // A fired S10 keeps its name: it is only its quiet state that reads "all checks ran".
      expect(container.querySelectorAll(".detail-check-name")[9]?.textContent).toBe("check gaps");
    });

    it("writes each object in a signal's data one line per field, and a list of ids joined", () => {
      const { container } = renderDetail(WALLABAG, "scheb/2fa-google-authenticator");
      const s10 = Array.from(container.querySelectorAll("details.detail-fired")).find(
        (row) => row.querySelector(".detail-fired-id")?.textContent === "S10",
      );
      const top = s10?.querySelector("dl.detail-data");
      const dds = Array.from(top?.querySelectorAll(":scope > dd") ?? []);
      expect(dds.map((dd) => dd.classList.contains("has-records"))).toEqual([true, false]);
      expect(text(dds[1] ?? null)).toBe("S2, S8");
      // The object is its own label/value list, one field a line, not a "key value · key value" run.
      const item = top?.querySelector(".detail-data-item");
      expect(item?.tagName).toBe("DL");
      const pairs = Array.from(item?.querySelectorAll(":scope > dt") ?? [], (dt) => [
        text(dt),
        text(dt.nextElementSibling),
      ]);
      expect(pairs).toEqual([
        ["check", "release_dates"],
        ["reason", "undated_releases"],
        ["blocks", "S2, S8"],
      ]);
      // The list of objects takes the row's full width; the list of ids sits beside its label.
      const wide = Array.from(top?.querySelectorAll(":scope > .is-wide") ?? []).map((el) => el.tagName);
      expect(wide).toEqual(["DT", "DD"]);
    });

    it("draws S7's packages as one table, package · verdict · via, each separator kept with its hop", () => {
      const { container } = renderDetail(WALLABAG, "scheb/2fa-google-authenticator");
      const s7 = Array.from(container.querySelectorAll("details.detail-fired")).find(
        (row) => row.querySelector(".detail-fired-id")?.textContent === "S7",
      );
      const table = s7?.querySelector("table.detail-pulled-table");
      expect(Array.from(table?.querySelectorAll("thead th") ?? [], (th) => th.getAttribute("scope"))).toEqual(
        ["col", "col", "col"],
      );
      expect(s7?.querySelector(".detail-data-item")).toBeNull();
      const cells = Array.from(table?.querySelectorAll("tbody tr:first-child td") ?? []);
      expect(cells[0]?.querySelector(".detail-token")?.textContent).toBe("symfony/");
      expect(cells[1]?.textContent).toBe("abandoned");
      // The open package's hop and the row's own are dropped: only what it comes in through stays.
      const via = cells[2];
      expect(via?.textContent).toBe("scheb/2fa-bundle\u00a0› symfony/security-bundle");
      // A package name wraps only after its "/", never at its hyphens, and the "›" rides in the
      // piece before it, so a line never starts on one.
      const tokens = Array.from(via?.querySelectorAll(".detail-token") ?? [], (el) => el.textContent);
      expect(tokens).toEqual(["scheb/", "2fa-bundle\u00a0›", "symfony/", "security-bundle"]);
    });

    it("keeps a package name in a fired check's summary whole", () => {
      const { container } = renderDetail(WALLABAG, "sensio/framework-extra-bundle");
      const tokens = Array.from(
        container.querySelectorAll(".detail-fired-text > .detail-token"),
        (el) => el.textContent,
      );
      expect(tokens).toContain("doctrine/annotations");
    });

    it("keeps a date and a verdict in a fired check's summary whole", () => {
      const { container } = renderDetail(WALLABAG, "spomky-labs/otphp");
      const tokens = Array.from(
        container.querySelectorAll(".detail-fired-text .detail-token"),
        (el) => el.textContent,
      );
      expect(tokens).toContain("2022-03-17");
      expect(tokens).toContain("(PKSA-kbc7-dq62-pt7d,");
    });

    it("labels data keys without underscores and splits a timestamp into date and quieter time", () => {
      const { container } = renderDetail(WALLABAG, "spomky-labs/otphp");
      const s8 = Array.from(container.querySelectorAll("details.detail-fired")).find(
        (row) => row.querySelector(".detail-fired-id")?.textContent === "S8",
      );
      const labels = Array.from(s8?.querySelectorAll(".detail-data dt") ?? [], (el) => el.textContent);
      expect(labels).toContain("branch last release");
      expect(labels.some((label) => label.includes("_"))).toBe(false);
      const row = Array.from(s8?.querySelectorAll(".detail-data dt") ?? []).find(
        (dt) => dt.textContent === "branch last release",
      );
      const dd = row?.nextElementSibling;
      expect(dd?.querySelector(".detail-data-date")?.textContent).toBe("2022-03-17");
      expect(dd?.querySelector(".detail-data-time")?.textContent).toBe("T08:00:35+00:00");
      expect(dd?.textContent).toBe("2022-03-17T08:00:35+00:00");
    });

    it("keeps a fired info-level cell in the low tone, which the checks block draws in its own blue", () => {
      const { container } = renderDetail(WALLABAG, "sensio/framework-extra-bundle");
      const s7 = container.querySelector(".detail-check.is-fired.tone-low .detail-check-id");
      expect(s7?.textContent).toBe("S7");
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

      const chain = container.querySelector<HTMLElement>(".detail-chain");
      if (chain === null) throw new Error("no chain");
      fireEvent.click(within(chain).getByRole("button", { name: "vendor/direct" }));
      expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "vendor/direct" });
    });

    it("opens a package the answer sentence names, when the lock lists it (PD-PROSE-1)", () => {
      const { container, dispatch } = renderDetail(MINI, "vendor/transitive");
      const answer = container.querySelector<HTMLElement>(".detail-answer");
      if (answer === null) throw new Error("no answer");
      fireEvent.click(within(answer).getByRole("button", { name: "vendor/direct" }));
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
      expect(screen.getByText("Not in baseline.json: new since it was written.")).toBeTruthy();
    });

    it("names the previous verdict and the current one for a worsened finding (PD-BASELINE-3)", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/worsened");
      const paragraph = container.querySelector(".detail-baseline");
      // The pills and the status word already say it got worse; the sentence says what moved.
      expect(paragraph?.textContent).toBe("baseline.json accepted it as stale; it is left-behind now.");
      const words = [...(paragraph?.querySelectorAll(".mono") ?? [])].map((node) => node.textContent);
      expect(words).toEqual(["stale", "left-behind"]);
    });

    it("draws the step as previous → current, hidden from assistive tech the sentence already serves", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/worsened");
      const step = container.querySelector(".bl-step");
      expect(step?.getAttribute("aria-hidden")).toBe("true");
      const pills = [...(step?.querySelectorAll(".pill") ?? [])].map((node) => node.textContent);
      expect(pills).toEqual(["stale", "left-behind"]);
      expect(step?.textContent).toContain("worsened");
    });

    it("draws 'no entry' where a new finding had nothing in the baseline", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/newpkg");
      const step = container.querySelector(".bl-step");
      expect(step?.querySelector(".bl-none")?.textContent).toBe("no entry");
      expect([...(step?.querySelectorAll(".pill") ?? [])].map((node) => node.textContent)).toEqual([
        "abandoned",
      ]);
    });

    it("says what an accepted finding was accepted as, and no build outcome the report does not record", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/known");
      expect(container.querySelector(".detail-baseline")?.textContent).toBe(
        "Already accepted in baseline.json as left-behind.",
      );
      // Accepted as left-behind, stale now: it moved, so the step is drawn.
      expect(container.querySelector(".bl-step")?.textContent).toContain("accepted");
    });

    it("draws no step for an accepted package still at the verdict it was accepted at", () => {
      const model = normalize({
        report: {
          lockrot: { version: "0.11.0", schema: 1 },
          generated_at: "2026-01-01T00:00:00Z",
          baseline: { path: "baseline.json", known: 1, new: 0, worsened: 0, stale: [] },
          findings: [
            {
              package: "vendor/same",
              version: "1.0.0",
              verdict: "stale",
              priority: "low",
              baseline: { status: "known", previous_verdict: "stale" },
            },
          ],
        },
      });
      if (!model.ok) throw new Error(model.error.message);
      const { container } = renderDetail(model.model, "vendor/same");
      expect(container.querySelector(".bl-step")).toBeNull();
      expect(container.querySelector(".detail-baseline")?.textContent).toBe(
        "Already accepted in baseline.json as stale.",
      );
    });

    // Evaluator: "It does not fail the build." stated an outcome the report does not record (no exit
    // code, and --strict-network can still fail a run). With a gate on the run the sentence names
    // lockrot's own counting rule instead; with none, it adds nothing.
    it("with a gate on the run, names --fail-on's counting rule rather than a build outcome", () => {
      const model = normalize({
        report: {
          lockrot: { version: "0.11.0", schema: 1 },
          generated_at: "2026-01-01T00:00:00Z",
          run: { fail_on: "high" },
          baseline: { path: "baseline.json", known: 1, new: 0, worsened: 0, stale: [] },
          findings: [
            {
              package: "vendor/same",
              version: "1.0.0",
              verdict: "stale",
              priority: "low",
              baseline: { status: "known", previous_verdict: "stale" },
            },
          ],
        },
      });
      if (!model.ok) throw new Error(model.error.message);
      const { container } = renderDetail(model.model, "vendor/same");
      const text = container.querySelector(".detail-baseline")?.textContent ?? "";
      expect(text).toBe("Already accepted in baseline.json as stale. lockrot's --fail-on does not count it.");
      expect(text).not.toMatch(/build|pass|fail the/);
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
      // The note rides in the last hop's own unit, and every "›" in the unit of the hop before it,
      // so a wrapped line never starts on a separator or on the note alone.
      const steps = Array.from(container.querySelectorAll(".detail-chain > .detail-chain-step"));
      expect(steps.at(-1)?.querySelector(".detail-hop-note")?.textContent).toBe("require-dev");
      expect(steps.at(-1)?.querySelector(".detail-hop-sep")).toBeNull();
      expect(steps.slice(0, -1).every((step) => step.lastElementChild?.matches(".detail-hop-sep"))).toBe(
        true,
      );
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
        "There are 4 newer branches. The newest is 1.x, released v1.17.0 on 2026-08-04 (2 months ago) and requires php ^7.4 || ^8.0.",
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
      // rector/rector (mautic_mautic.json): a dev-main snapshot two months old.
      const { container } = renderDetail(loadModel("mautic_mautic.json"), "rector/rector");
      expect(container.querySelector(".detail-timeline-answer")?.textContent).toContain("dated 2 months ago");
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

    it("names the monorepo that dated a split package's rows", () => {
      // lockrot 0.13.0 dates illuminate/* by laravel/framework's tags (`dated_by`,
      // `installed_release_dated_by`); here meilisearch-php's 1.x and its installed version stand in.
      const details = KOEL.details.get("meilisearch/meilisearch-php");
      if (details?.metadata == null) throw new Error("meilisearch-php has no metadata");
      const branches = details.metadata.branches.map((branch) =>
        branch.branch === "1.x" || branch.branch === "0.23.x"
          ? { ...branch, datedBy: "laravel/framework" }
          : branch,
      );
      const split: PackageDetails = {
        ...details,
        metadata: { ...details.metadata, branches },
      };
      const model: Model = {
        ...KOEL,
        details: new Map([...KOEL.details, ["meilisearch/meilisearch-php", split] as const]),
      };
      const { container } = renderDetail(model, "meilisearch/meilisearch-php");
      const note = container.querySelector(".detail-timeline-dated-by")?.textContent ?? "";
      expect(note).toContain("1.x");
      expect(note).toContain("laravel/framework");
      expect(note).not.toContain("0.24.x");
      const row = [...container.querySelectorAll(".detail-timeline-row")].find(
        (el) => el.querySelector('[role="rowheader"]')?.textContent.startsWith("1.x") === true,
      );
      expect(row?.querySelector(".detail-timeline-strip")?.textContent).toContain(
        "dated by laravel/framework",
      );
    });

    it("says whose tag dates the installed version when a monorepo supplied it", () => {
      const metadata = KOEL.details.get("meilisearch/meilisearch-php")?.metadata;
      if (metadata == null) throw new Error("meilisearch-php has no metadata");
      const split: PackageDetails = {
        lock: null,
        activity: null,
        repositoryLink: null,
        metadata: {
          ...metadata,
          branches: [],
          installedRelease: "2025-01-31T10:04:17+00:00",
          installedReleaseDatedBy: "laravel/framework",
        },
      };
      const model: Model = {
        ...EXTRA_MODEL,
        details: new Map([...EXTRA_MODEL.details, ["vendor/newpkg", split] as const]),
      };
      const { container } = renderDetail(model, "vendor/newpkg");
      expect(container.textContent).toContain("your version, dated by laravel/framework");
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

  // PD-RUN-5: Provenance never ends on a bare dash — a source this file gives nothing for says why.
  describe("provenance without an explain block", () => {
    it("says a package from outside a Composer repository has neither metadata nor activity", () => {
      const { container } = renderDetail(loadModel("capsule-0.10-drupal.json"), "drupal/core");
      const provenance = openReference(container, "Provenance");
      // One reason for both sources, said once.
      expect(provenance?.querySelector(".detail-prov-source")?.textContent).toBe(
        "Package metadata · repository activity",
      );
      expect(
        Array.from(provenance?.querySelectorAll(".detail-prov-reason") ?? [], (el) => el.textContent),
      ).toEqual(["none — not from a Composer repository"]);
      // The strip's quiet S3/S4 said from this side too, so the two never read as a contradiction.
      expect(provenance?.querySelector(".detail-prov-note")?.textContent).toBe(
        "S3 and S4 show quiet above, with no repository activity in this file.",
      );
    });

    // Eval (auditor): a quiet S4 beside "no activity read" contradicted itself, and the cell was a
    // dead span. Now it is marked apart, counted in the tally, named in its own line, and links.
    it("marks a quiet S3/S4 with no activity on file, and points it at Provenance's reason", async () => {
      const { container } = renderDetail(loadModel("capsule-0.10-drupal.json"), "drupal/core");
      expect(container.querySelector(".detail-checks-tally")?.textContent).toBe(
        "2 fired · 8 quiet (2 with no activity on file) · every check ran.",
      );
      const unread = Array.from(container.querySelectorAll(".detail-check.is-unread"), (el) =>
        el.getAttribute("aria-label"),
      );
      expect(unread).toEqual([
        "S3 archived, quiet with no repository activity in this file: show why",
        "S4 push age, quiet with no repository activity in this file: show why",
      ]);
      const lines = Array.from(container.querySelectorAll(".detail-checks-line"), (el) =>
        el.textContent.replace(/\s+/g, " "),
      );
      expect(lines[0]).toBe(
        "Quiet: S1 abandoned · S2 release age · S5 predates PHP · S8 branch stopped · S9 advisories · S10 all checks ran",
      );
      expect(lines[1]).toBe(
        "Quiet with no repository activity in this file: S3 archived · S4 push age — the package is not from a Composer repository. See Provenance",
      );
      fireEvent.click(
        screen.getByRole("button", { name: /^S4 push age, quiet with no repository activity/ }),
      );
      expect(container.querySelector<HTMLDetailsElement>("#detail-provenance")?.open).toBe(true);
      await nextFrame();
      expect(document.activeElement).toBe(container.querySelector("#detail-prov-activity"));
    });

    it("gives an absent metadata source no as-of date, only its reason", () => {
      const { container } = renderDetail(loadModel("synthetic-no-details.json"), "daverandom/resume");
      const metadata = openReference(container, "Provenance")?.querySelector(".detail-prov-line");
      expect(metadata?.querySelectorAll("dt").length).toBe(0);
      expect(metadata?.textContent).not.toContain("as of");
    });

    it("reads the forge facts off a fired S4 when the document has no details", () => {
      const { container } = renderDetail(loadModel("synthetic-no-details.json"), "daverandom/resume");
      const activity = container.querySelector("#detail-prov-activity");
      expect(activity?.querySelector(".detail-prov-source")?.textContent).toBe(
        "Repository activity · github.com from S4’s data",
      );
      expect(activity?.textContent).toContain("DaveRandom/Resume");
      // Spelled out as the fired S4 above words it ("8.2 years ago"), not "8.2 y ago".
      expect(activity?.textContent).toContain("2018-06-25 · 8.2 years ago");
      expect(activity?.textContent).toContain("no (S3 quiet)");
      expect(activity?.textContent).toContain("not in this document");
      const metadata = openReference(container, "Provenance")?.querySelector(".detail-prov-reason");
      expect(metadata?.textContent).toBe("not in this document — it explains no package");
    });

    it("moves focus onto the activity line itself when a quiet S4 points there", async () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      fireEvent.click(screen.getByRole("button", { name: "S4 push age, quiet: show the evidence" }));
      await nextFrame();
      expect(document.activeElement).toBe(container.querySelector("#detail-prov-activity"));
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

    // PD-RUN-5: the repository activity lockrot read, as one compact line under the metadata one.
    it("shows the repository activity in provenance, and a quiet S4 cell opens it", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      const activity = container.querySelector("#detail-prov-activity");
      expect(activity?.querySelector(".detail-prov-source")?.textContent).toBe(
        "Repository activity · GitHub",
      );
      expect(Array.from(activity?.querySelectorAll("dt") ?? [], (el) => el.textContent)).toEqual([
        "repository",
        "archived",
        "last push",
        "fetched",
      ]);
      expect(activity?.textContent).toContain("predis/predis");
      expect(activity?.textContent).toContain("during this run");

      const provenance = container.querySelector<HTMLDetailsElement>("#detail-provenance");
      expect(provenance?.open).toBe(false);
      const s4 = screen.getByRole("button", { name: "S4 push age, quiet: show the evidence" });
      fireEvent.click(s4);
      expect(provenance?.open).toBe(true);
    });

    it("a fired cell opens its own row", () => {
      const { container } = renderDetail(KOEL, "predis/predis");
      const row = container.querySelector<HTMLDetailsElement>("#detail-sig-S8");
      expect(row?.open).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "S8 branch stopped, fired: show the evidence" }));
      expect(row?.open).toBe(true);
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
        "fired · ",
        "Follow the upstream",
        "Release branches",
        "The lock entry",
        "Provenance",
      ]);
      expect(order).not.toContain(-1);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("puts against the baseline first under the answer, ahead of why this priority and the reference sections (PD-BASELINE-3)", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/worsened");
      const order = markerOrder(container, [
        "How it gets in",
        "Against the baseline",
        "Why this is medium",
        "The lock entry",
      ]);
      expect(order).not.toContain(-1);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("puts the checks ahead of every advisory, and both ahead of the reference sections (PD-DETAIL-12)", () => {
      const { container } = renderDetail(EXTRA_MODEL, "vendor/vulnerable");
      const order = markerOrder(container, ["fired · ", "Every advisory", "The lock entry"]);
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
