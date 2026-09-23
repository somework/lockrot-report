import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { currentRenderer, FIXTURES } from "./support/pages";

const renderer = currentRenderer();
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
    test.fail(
      renderer === "legacy",
      "M17: legacy ledger legend buttons carry data-on, never aria-pressed (report.js:869)",
    );
    expect(await report.ledgerButtonPressed("prio", "medium")).toBe(false);
    await report.ledgerButton("prio", "medium");
    expect(await report.ledgerButtonPressed("prio", "medium")).toBe(true);
  });

  test("M29: the priority ledger's tooltip matches what it actually counts", async () => {
    test.fail(
      renderer === "legacy",
      'M29: legacy\'s static tooltip says "except ok and finished" but the count also excludes unknown (report.html:52, report.js:246)',
    );
    const tooltip = await report.priorityLedgerTooltip();
    expect(tooltip).not.toBe("Every verdict except ok and finished");
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

  test("scope: direct excludes both flagged findings (neither is a direct requirement)", async () => {
    await report.railOption("scope", "direct");
    expect(await report.rows()).toEqual([]);
  });

  test("signal: narrows to findings carrying that signal id", async () => {
    await report.railOption("signal", "S6");
    expect(await report.rows()).toEqual(["vendor/snapshot"]);
  });

  test("rail options already expose aria-pressed in legacy too (not an M17 gap)", async () => {
    expect(await report.railOptionPressed("scope", "direct")).toBe(false);
    await report.railOption("scope", "direct");
    expect(await report.railOptionPressed("scope", "direct")).toBe(true);
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
    await report.search("snapshot");
    await report.railOption("scope", "direct");
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
