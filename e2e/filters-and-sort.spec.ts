import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("ledger filter groups (prio/verdict) — mini.json", () => {
  test.beforeEach(async () => {
    await report.goto(FIXTURES.mini);
  });

  test("prio: selecting a priority narrows Findings to that priority", async () => {
    await report.ledgerButton("prio", "medium");
    expect(await report.rows()).toEqual(["vendor/snapshot"]);
  });

  test("verdict: selecting a verdict narrows Findings to that verdict", async () => {
    await report.ledgerButton("verdict", "abandoned");
    expect(await report.rows()).toEqual(["vendor/transitive"]);
  });

  test("M17: ledger buttons expose a pressed state to assistive tech", async () => {
    // M17 (DESIGN.md §5), fixed on purpose: legacy's ledger legend buttons carried a plain
    // data-on attribute, never aria-pressed.
    expect(await report.ledgerButtonPressed("prio", "medium")).toBe(false);
    await report.ledgerButton("prio", "medium");
    expect(await report.ledgerButtonPressed("prio", "medium")).toBe(true);
  });

  test("PD-LEDGER-2: a legend chip's title names the click's effect, and changes once pressed", async () => {
    // PD-LEDGER-2 (DESIGN.md §5): a legend entry used to carry no title at all, so hovering or
    // focusing it gave no hint it was a control rather than plain distribution text.
    expect(await report.ledgerButtonTitle("verdict", "abandoned")).toBe("Show only abandoned");
    await report.ledgerButton("verdict", "abandoned");
    expect(await report.ledgerButtonTitle("verdict", "abandoned")).toBe(
      "Showing only abandoned — click to clear this filter",
    );
  });

  test("M29: the priority ledger's tooltip matches what it actually counts", async () => {
    // M29 (DESIGN.md §5), fixed on purpose: legacy's static tooltip said "except ok and finished"
    // but the count it described also excluded unknown.
    const tooltip = await report.priorityLedgerTooltip();
    expect(tooltip).not.toBeNull();
    expect(tooltip).toBe("Every verdict except ok, finished and unknown");
  });
});

test.describe("rail filter groups (scope/signal) — mini.json Findings tab", () => {
  test.beforeEach(async () => {
    await report.goto(FIXTURES.mini);
  });

  test("scope: transitive narrows out the direct requirement", async () => {
    await report.railOption("scope", "transitive");
    expect(await report.rows()).toEqual(expect.arrayContaining(["vendor/transitive", "vendor/snapshot"]));
  });

  test("scope: direct is not offered, since neither flagged finding is a direct requirement (PD-RAIL-2)", async () => {
    // It used to be offered as "Direct 0" and select an empty list; a row that would list nothing is
    // now left out unless it is on.
    expect(await report.railOptionPressed("scope", "direct")).toBeNull();
  });

  test("signal: narrows to findings carrying that signal id", async () => {
    await report.railOption("signal", "S6");
    expect(await report.rows()).toEqual(["vendor/snapshot"]);
  });

  test("rail options expose aria-pressed (not an M17 gap — that one was ledger-only)", async () => {
    expect(await report.railOptionPressed("scope", "transitive")).toBe(false);
    await report.railOption("scope", "transitive");
    expect(await report.railOptionPressed("scope", "transitive")).toBe(true);
  });
});

test.describe("rail fix-shape group — wallabag (needs advisories)", () => {
  test("fix: move selects advisories fixed off-branch, and no other shape button is offered", async () => {
    await report.goto(FIXTURES.wallabag);
    await report.tab("advisories");
    // Both of spomky-labs/otphp's advisories are fixed_by "11.5.0" with fixed_on_branch: false,
    // i.e. shape "move" (report.js:508) — the rail's "What the fix costs" group only lists shapes
    // that occur at all (report.js:386), so "branch"/"none" are not offered here.
    expect(await report.railOptionPressed("fix", "branch")).toBeNull();
    await report.railOption("fix", "move");
    expect(await report.rows()).toEqual(["spomky-labs/otphp", "spomky-labs/otphp"]);
  });
});

test.describe("clear", () => {
  test("resets the query and every filter group, but not the tab or the open package", async () => {
    await report.goto(FIXTURES.mini);
    await report.tab("packages");
    await report.openPackage("vendor/snapshot");
    await report.railOption("scope", "direct");
    await report.search("snapshot");
    expect(await report.rows()).toEqual([]);

    await report.clear();
    expect(await report.searchValue()).toBe("");
    expect(await report.rows()).toHaveLength(4);
    expect(await report.activeTab()).toBe("packages");
    expect((await report.detail()).name).toBe("vendor/snapshot");
  });
});

test.describe("sort (Packages tab)", () => {
  test.beforeEach(async () => {
    await report.goto(FIXTURES.mini);
    await report.tab("packages");
  });

  test("clicking a column sorts ascending; clicking it again reverses", async () => {
    await report.sortBy("package");
    expect(await report.sortState()).toEqual({ key: "package", desc: false });
    expect(await report.rows()).toEqual([
      "private/thing",
      "vendor/direct",
      "vendor/snapshot",
      "vendor/transitive",
    ]);

    await report.sortBy("package");
    expect(await report.sortState()).toEqual({ key: "package", desc: true });
    expect(await report.rows()).toEqual([
      "vendor/transitive",
      "vendor/snapshot",
      "vendor/direct",
      "private/thing",
    ]);
  });

  test("clicking a different column switches the sort key and resets to ascending", async () => {
    await report.sortBy("package");
    await report.sortBy("package"); // now descending
    await report.sortBy("verdict");
    expect(await report.sortState()).toEqual({ key: "verdict", desc: false });
  });
});

// PD-RAIL-1 (DESIGN.md §5): a rail row's count is the number of packages the list shows once it is
// selected, on every tab that lists packages by row, over the three real corpora. The fix-cost group
// used to count advisories over a filter that keeps packages: wallabag's spomky-labs/otphp, with two
// other-branch advisories, read "Moving to another branch 2" over one row. Blast radius lists under
// cards, not by row; tests/unit/ui/railCounts.test.ts holds it to the same rule.
test.describe("PD-RAIL-1: every rail count is the list it selects", () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 1440, height: 900 } });

  // koel and mautic carry no advisory, so their Advisories tab has no rail to check.
  const cases = [
    ...(["findings", "advisories", "packages"] as const).map((view) => [FIXTURES.wallabag, view] as const),
    ...[FIXTURES.koel, FIXTURES.mautic].flatMap((fixture) =>
      (["findings", "packages"] as const).map((view) => [fixture, view] as const),
    ),
  ];

  for (const [fixture, view] of cases) {
    test(`${fixture}, ${view}`, async () => {
      await report.goto(fixture);
      await report.tab(view);
      const rows = await report.railRows();
      expect(rows.length).toBeGreaterThan(0);

      const mismatches: string[] = [];
      for (const row of rows) {
        await report.toggleRailRow(row.label);
        const listed = await report.listedPackageCount();
        if (listed !== row.count) mismatches.push(`${row.label}: shows ${row.count}, lists ${listed}`);
        await report.toggleRailRow(row.label);
      }

      expect(mismatches).toEqual([]);
    });
  }
});
