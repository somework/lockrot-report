import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/preact";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Report2Embed } from "../../../src/model/report";
import { INITIAL_STATE, type State } from "../../../src/state/types";
import { ReportContext } from "../../../src/ui/context";
import { tabName, Tabs } from "../../../src/ui/Tabs";

afterEach(cleanup);

function renderTabs(
  state: State = INITIAL_STATE,
  caseName = "composite",
  edit: (embed: Report2Embed) => Report2Embed = (embed) => embed,
) {
  const result = normalize(edit(assembleEmbed(caseName)));
  if (!result.ok) throw new Error(result.error.message);
  const { model } = result;
  return render(
    <ReportContext.Provider
      value={{
        model,
        state,
        dispatch: vi.fn(),
        now: new Date(model.report.generated_at),
        wide: true,
        cursor: null,
        openGlossary: vi.fn(),
        shell: "posix",
        pickShell: vi.fn(),
      }}
    >
      <Tabs idBase="t" panelId="panel" />
    </ReportContext.Provider>,
  );
}

function tabNames(): (string | null)[] {
  return screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"));
}

describe("tab names", () => {
  it("say the label and its count as two words, from the whole report", () => {
    renderTabs();

    // composite: graded findings, counted advisories, every package and the exposure entries of the document, no notes.
    // Overview, first, lists nothing and has no badge.
    expect(tabNames()).toEqual([
      "Overview",
      "Findings 9",
      "Advisories 29",
      "All packages 9",
      "Blast radius 2",
      "Run data",
    ]);
  });

  it("count a report with nothing flagged as zero, and every package on All packages", () => {
    renderTabs(INITIAL_STATE, "stale-accepted-dagger");

    // One package checked, none flagged, no advisory, no exposure entry.
    expect(tabNames()).toEqual([
      "Overview",
      "Findings 0",
      "Advisories 0",
      "All packages 1",
      "Blast radius 0",
      "Run data",
    ]);
  });

  it("give Run data the count of the run's notes", () => {
    renderTabs(INITIAL_STATE, "B-accepted-dagger");

    expect(tabNames().at(-1)).toBe("Run data 1");
  });

  it("do not move with the search or a filter", () => {
    renderTabs({
      ...INITIAL_STATE,
      q: "no-such-package",
      filters: { ...INITIAL_STATE.filters, flag: ["stale"] },
    });

    expect(tabNames()[1]).toBe("Findings 9");
  });

  it("tabName: a tab with no badge is its label alone", () => {
    expect(tabName("Run data", "", null)).toBe("Run data");
    expect(tabName("All packages", "271", null)).toBe("All packages 271");
    expect(tabName("Advisories", "0", "check incomplete")).toBe("Advisories 0, check incomplete");
  });
});

describe("the Advisories tab's count from an incomplete check (PD-ADV-7)", () => {
  it("carries a mark, named in the tab's own name", () => {
    // C-offline‡: the run was offline, so its advisory lookup did not run.
    renderTabs(INITIAL_STATE, "C-offline-dagger");

    const tab = screen.getByRole("tab", { name: /^Advisories/ });
    expect(tab.getAttribute("aria-label")).toMatch(/^Advisories \d+, check not run$/);
    expect(tab.querySelector(".tab-flag")?.getAttribute("title")).toBe("advisory check not run");
  });

  it("carries none on a lock with no finding, whatever note the run wrote", () => {
    renderTabs(INITIAL_STATE, "composite", (embed) => ({
      ...embed,
      report: {
        ...embed.report,
        findings: [],
        security: {
          ...embed.report.security,
          check: "complete",
          packages: { vulnerable: 0, unchecked: 0, ignored: 0, clear: 0 },
        },
        note_details: [
          ...embed.report.note_details,
          {
            code: "advisories_not_checked",
            text: "advisories were not checked",
            docs_url: null,
            sets_network_failures: false,
            data: { reason: "offline", composer_repositories_checked: 0 },
          },
        ],
      },
    }));

    const tab = screen.getByRole("tab", { name: /^Advisories/ });
    expect(tab.querySelector(".tab-flag")).toBeNull();
    expect(tab.getAttribute("aria-label")).toBe("Advisories 0");
  });

  it("carries none after a complete check", () => {
    renderTabs();

    expect(screen.getByRole("tab", { name: /^Advisories/ }).querySelector(".tab-flag")).toBeNull();
  });
});

describe("Tabs' overflow chevrons (PD-TABS-1)", () => {
  it("keep the tab list the only thing a keyboard or screen reader meets: one Tab stop, chevrons hidden from both", () => {
    // Arrange + Act
    const { container } = renderTabs({ ...INITIAL_STATE, view: "radius" });

    // Assert: the roving tabindex is untouched — only the selected tab is in the Tab order.
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, -1, -1, 0, -1]);
    const chevrons = [...container.querySelectorAll<HTMLButtonElement>(".tabs-scroll")];
    expect(chevrons).toHaveLength(2);
    for (const chevron of chevrons) {
      expect(chevron.tabIndex).toBe(-1);
      expect(chevron.getAttribute("aria-hidden")).toBe("true");
      // The list is not wider than itself under happy-dom (no layout): nothing to scroll to.
      expect(chevron.hidden).toBe(true);
    }
    // Nothing but tabs inside the tab list itself.
    expect(screen.getByRole("tablist").querySelectorAll(":scope > :not([role='tab'])")).toHaveLength(0);
  });

  it("marks neither edge when the row fits", () => {
    const { container } = renderTabs();
    expect(container.querySelector(".tabs-strip")?.className).toBe("tabs-strip");
  });
});
