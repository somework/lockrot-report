import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";

/**
 * The search grammar of a report-2 page (`domain/query.ts`): a bare word against the package name
 * and version, and `key:value` operators that narrow one field.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("on the All packages tab, which draws every finding whatever its grade", () => {
  test.beforeEach(async () => {
    await report.gotoReport2("composite");
    await report.tab("packages");
  });

  test("a bare word matches case-insensitively", async () => {
    await report.search("SYMFONY");
    expect(await report.rows()).toEqual(
      expect.arrayContaining(["symfony/monolog-bridge", "symfony/yaml", "symfony/polyfill-intl-idn"]),
    );
    expect(await report.rows()).not.toContain("twig/twig");
  });

  test("direct:yes / direct:no narrow on the direct flag", async () => {
    await report.search("direct:yes");
    expect(await report.rows()).not.toContain("symfony/polyfill-intl-idn");
    expect(await report.rows()).toHaveLength(6);

    await report.search("direct:no");
    expect(await report.rows()).toEqual(["symfony/polyfill-intl-idn"]);
  });

  test("dev:yes / dev:no narrow on the dev flag (none of this lock's flagged packages is dev-only)", async () => {
    await report.search("dev:yes");
    expect(await report.rows()).toEqual([]);

    await report.search("dev:no");
    expect(await report.rows()).toHaveLength(7);
  });

  test("repeating direct:/dev: overwrites rather than accumulating", async () => {
    // direct and dev are single-valued: the second occurrence wins outright, unlike verdict: and
    // lead:, which OR together.
    await report.search("direct:yes direct:no");
    expect(await report.rows()).toEqual(["symfony/polyfill-intl-idn"]);
  });

  test("a whitespace-only query matches everything (the query is trimmed before it is split)", async () => {
    await report.search("   ");
    expect(await report.rows()).toHaveLength(7);
  });

  test("WS-Q: a whitespace-only query is not counted as an active filter (DESIGN.md §4)", async () => {
    // WS-Q (DESIGN.md §5), fixed on purpose: the untrimmed query used to count as one active filter
    // even when it was only whitespace.
    await report.search("   ");
    const line = await report.countLine();
    expect(line).not.toBeNull();
    expect(line).not.toMatch(/filter/i);
    // ...and it must not be written to the address bar either.
    expect(await report.hash()).not.toContain("q=");
  });
});

test.describe("on a report-2 page", () => {
  test.beforeEach(async () => {
    await report.gotoReport2("composite");
  });

  test("a bare word matches the package name and its version", async () => {
    await report.search("symfony yaml");
    expect(await report.rows()).toEqual(["symfony/yaml"]);
    await report.search("v2.16");
    expect(await report.rows()).toEqual(["twig/twig"]);
  });

  test("flag: narrows to every flag named, and lead: to the published lead", async () => {
    await report.search("flag:old-promise");
    expect(await report.rows()).toEqual(["symfony/monolog-bridge", "symfony/debug", "tubalmartin/cssmin"]);
    await report.search("flag:old-promise flag:stale");
    expect(await report.rows()).toEqual(["tubalmartin/cssmin"]);
    await report.search("lead:left-behind");
    expect(await report.rows()).toEqual(["symfony/monolog-bridge"]);
  });

  test("verdict: widens on repeats, and priority: reads as verdict:", async () => {
    await report.search("verdict:low priority:high");
    expect(await report.rows()).toEqual([
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
  });

  test("score:>=N compares with the published total", async () => {
    await report.search("score:>=32");
    expect(await report.rows()).toEqual(["twig/twig", "symfony/monolog-bridge", "symfony/debug"]);
  });

  test("direct:no keeps the packages no requirement names directly", async () => {
    await report.search("direct:no");
    expect(await report.rows()).toEqual(["symfony/polyfill-intl-idn"]);
  });
});
