import { describe, expect, it } from "vitest";
import { matchesFinding2, parseQuery2 } from "../../../src/domain/query";
import type { Finding, Report2 } from "../../../src/model/report";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;

function matching(query: string): string[] {
  const terms = parseQuery2(query);
  return composite.findings.filter((f) => matchesFinding2(f, terms)).map((f) => f.package);
}

function finding(pkg: string): Finding {
  const found = composite.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`${pkg} is not in the composite`);
  return found;
}

describe("parseQuery2", () => {
  it("reads every report-2 key and keeps free words lower-cased", () => {
    expect(parseQuery2("Twig flag:Old-Promise lead:stale verdict:HIGH score:>=16 direct:yes")).toEqual([
      { field: null, value: "twig" },
      { field: "flag", value: "old-promise" },
      { field: "lead", value: "stale" },
      { field: "verdict", value: "high" },
      { field: "score", value: ">=16" },
      { field: "direct", value: "true" },
    ]);
  });

  it("reads priority: as verdict:", () => {
    expect(parseQuery2("priority:critical")).toEqual([{ field: "verdict", value: "critical" }]);
  });

  it("gives no term for a blank query", () => {
    expect(parseQuery2("   ")).toEqual([]);
  });
});

describe("matchesFinding2", () => {
  it("matches free words against the package and its version", () => {
    expect(matching("symfony yaml")).toEqual(["symfony/yaml"]);
    expect(matching("v2.16")).toEqual(["twig/twig"]);
  });

  it("widens on repeated verdict: and priority:", () => {
    expect(matching("verdict:high")).toEqual(["friendsofsymfony/oauth-server-bundle", "tubalmartin/cssmin"]);
    expect(matching("verdict:low priority:high")).toEqual([
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
  });

  it("narrows on every flag: a finding counts", () => {
    expect(matching("flag:old-promise")).toEqual([
      "symfony/monolog-bridge",
      "symfony/debug",
      "tubalmartin/cssmin",
    ]);
    expect(matching("flag:old-promise flag:stale")).toEqual(["tubalmartin/cssmin"]);
  });

  it("matches lead: on the published lead only", () => {
    expect(matching("lead:left-behind")).toEqual(["symfony/monolog-bridge"]);
    expect(matching("lead:vulnerable")).toEqual([]);
  });

  it("compares score: with the published total", () => {
    expect(matching("score:>=32")).toEqual(["twig/twig", "symfony/monolog-bridge", "symfony/debug"]);
    expect(matching("score:>32")).toEqual(["symfony/monolog-bridge", "symfony/debug"]);
    expect(matching("score:<=2")).toEqual(["symfony/yaml", "symfony/polyfill-intl-idn"]);
    expect(matching("score:18")).toEqual(["friendsofsymfony/oauth-server-bundle", "tubalmartin/cssmin"]);
  });

  it("matches nothing for a score: that is not a number", () => {
    expect(matching("score:>=high")).toEqual([]);
  });

  it("takes the last direct: and dev: term", () => {
    expect(matching("direct:yes direct:no")).toEqual(["symfony/polyfill-intl-idn"]);
    expect(matching("dev:yes")).toEqual([]);
  });

  it("does not count an accepted flag for flag:", () => {
    const accepted = readContractJson("report-2", "D-partial-dagger.json") as Report2;
    const cssmin = accepted.findings[0];
    if (cssmin === undefined) throw new Error("D-partial has no finding");
    expect(matchesFinding2(cssmin, parseQuery2("flag:old-promise"))).toBe(true);
    expect(matchesFinding2(cssmin, parseQuery2("flag:stale"))).toBe(false);
    expect(matchesFinding2(finding("tubalmartin/cssmin"), parseQuery2("flag:stale"))).toBe(true);
  });
});
