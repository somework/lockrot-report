import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { currentRenderer, FIXTURES } from "./support/pages";

const renderer = currentRenderer();

/**
 * The search grammar (`LockrotLib.parseQuery`, `matches()`): a bare word against package/version/
 * verdict/evidence text, and `key:value` operators that narrow one field. Exercised mostly on the
 * Packages tab (`fixtures/bundles/mini.json`), which draws from every finding regardless of verdict,
 * so an operator's effect is visible without a flagged-only tab hiding half the fixture.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
  await report.goto(FIXTURES.mini);
  await report.tab("packages");
});

test("a bare word matches package name, version, verdict or evidence, case-insensitively", async () => {
  await report.search("VENDOR");
  expect(await report.rows()).toEqual(
    expect.arrayContaining(["vendor/transitive", "vendor/snapshot", "vendor/direct"]),
  );
  expect(await report.rows()).not.toContain("private/thing");
});

test("multiple bare words AND together", async () => {
  await report.search("vendor snapshot");
  expect(await report.rows()).toEqual(["vendor/snapshot"]);
});

test("verdict: narrows to that verdict", async () => {
  await report.search("verdict:pinned");
  expect(await report.rows()).toEqual(["vendor/snapshot"]);
});

test("priority: narrows to that priority", async () => {
  await report.search("priority:high");
  expect(await report.rows()).toEqual(["vendor/transitive"]);
});

test("signal: requires the finding to carry that signal id, case-insensitively typed", async () => {
  await report.search("signal:s6");
  expect(await report.rows()).toEqual(["vendor/snapshot"]);
});

test("direct:yes / direct:no narrow on the direct flag", async () => {
  await report.search("direct:yes");
  expect(await report.rows()).toEqual(["vendor/direct"]);

  await report.search("direct:no");
  expect(await report.rows()).toEqual(
    expect.arrayContaining(["vendor/transitive", "vendor/snapshot", "private/thing"]),
  );
});

test("dev:yes / dev:no narrow on the dev flag (none of this fixture is dev-only)", async () => {
  await report.search("dev:yes");
  expect(await report.rows()).toEqual([]);

  await report.search("dev:no");
  expect(await report.rows()).toHaveLength(4);
});

test("repeating direct:/dev: overwrites rather than accumulating", async () => {
  // lib.js:206 — direct/dev are single-valued; the second occurrence wins outright, unlike the
  // array-valued keys (verdict/priority/signal/severity/cve) which OR together.
  await report.search("direct:yes direct:no");
  expect(await report.rows()).toEqual(
    expect.arrayContaining(["vendor/transitive", "vendor/snapshot", "private/thing"]),
  );
  expect(await report.rows()).not.toContain("vendor/direct");
});

test("repeating verdict: widens (OR), it does not narrow further", async () => {
  await report.search("verdict:pinned verdict:abandoned");
  expect(await report.rows()).toEqual(expect.arrayContaining(["vendor/transitive", "vendor/snapshot"]));
});

test("a whitespace-only query matches everything (parseQuery trims before splitting)", async () => {
  await report.search("   ");
  expect(await report.rows()).toHaveLength(4);
});

test("WS-Q: a whitespace-only query is not counted as an active filter (DESIGN.md §4)", async () => {
  test.fail(
    renderer === "legacy",
    "WS-Q: legacy counts raw untrimmed state.q as one active filter even when it is only whitespace (report.js:873)",
  );
  await report.search("   ");
  const line = await report.countLine();
  expect(line).not.toBeNull();
  expect(line).not.toMatch(/filter/i);
  // ...and it must not be written to the address bar either (report.js:914 writes state.q raw).
  expect(await report.hash()).not.toContain("q=");
});

/**
 * `fixtures/bundles/wallabag_wallabag.json`: the one fixture in this suite with a real advisory
 * (spomky-labs/otphp, `left-behind`, 2 advisories: one "high", one "medium", both with a null `cve`
 * and a `PKSA-...` `id`).
 */
test.describe("severity: and cve: (need a fixture with advisories)", () => {
  test.beforeEach(async () => {
    await report.goto(FIXTURES.wallabag);
    await report.tab("advisories");
  });

  test("severity: narrows the individual advisory rows, not just the package", async () => {
    expect(await report.rows()).toEqual(["spomky-labs/otphp", "spomky-labs/otphp"]);
    await report.search("severity:high");
    expect(await report.rows()).toEqual(["spomky-labs/otphp"]);
  });

  test("cve: falls back to the advisory's id when cve is null (report.js:220-222)", async () => {
    await report.search("cve:PKSA-KBC7");
    expect(await report.rows()).toEqual(["spomky-labs/otphp"]);
    await report.search("cve:nothing-matches-this");
    expect(await report.rows()).toEqual([]);
  });
});
