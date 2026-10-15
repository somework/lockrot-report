import { describe, expect, it } from "vitest";
import {
  dataAsOf,
  installedAge,
  libyearsCell,
  reachedWord,
  signalIds,
} from "../../../src/domain/packageCells2";
import type { Finding, Report2 } from "../../../src/model/report2";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;

function finding(pkg: string, doc: Report2 = composite): Finding {
  const found = doc.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`no finding ${pkg}`);
  return found;
}

const twig = finding("twig/twig");

describe("libyearsCell", () => {
  it("prints two decimals", () => {
    expect(libyearsCell({ ...twig, libyears: 3.456, libyears_at_least: false })).toEqual({
      text: "3.46",
      label: null,
    });
  });

  it("prefixes a lower bound with ≥ and says at least to a screen reader", () => {
    expect(libyearsCell({ ...twig, libyears: 1.5, libyears_at_least: true })).toEqual({
      text: "≥ 1.50",
      label: "at least 1.50",
    });
  });

  it("prints a dash with the cause words when unmeasured", () => {
    expect(libyearsCell({ ...twig, libyears: null, libyears_unmeasured: "undated" })).toEqual({
      text: "—",
      label: "no date",
    });
  });
});

describe("installedAge", () => {
  it("prints the installed age as a years phrase", () => {
    const age = { ...twig.age, installed: { at: "2020-01-01T00:00:00Z", years: 6.94, dated_by: null } };
    expect(installedAge({ ...twig, age })).toEqual({ text: "6.9 years ago", label: null });
  });

  it("prints a dash with the cause words when unmeasured", () => {
    const age = { ...twig.age, installed: null, installed_unmeasured: "shared_commit" as const };
    expect(installedAge({ ...twig, age })).toEqual({
      text: "—",
      label: "dated only by a commit its tags share",
    });
  });
});

describe("reachedWord", () => {
  it("says direct, the hops it reads from depth, or unreached, with dev after", () => {
    expect(reachedWord(twig)).toBe("direct");
    expect(reachedWord({ ...twig, reach: "transitive", direct: false, depth: 1 })).toBe("1 hop");
    expect(reachedWord({ ...twig, reach: "transitive", direct: false, depth: 3, dev: true })).toBe(
      "3 hops · dev",
    );
    expect(reachedWord({ ...twig, reach: "unreached", direct: false, depth: null })).toBe("unreached");
  });
});

describe("signalIds and dataAsOf", () => {
  it("lists the fired signal ids, or a dash", () => {
    expect(signalIds(twig)).toBe(twig.signals.map((s) => s.id).join(" "));
    expect(signalIds({ ...twig, signals: [] })).toBe("—");
  });

  it("prints the data date, or a dash", () => {
    expect(dataAsOf({ ...twig, data_date: "2026-09-30T08:00:00Z" })).toBe("2026-09-30");
    expect(dataAsOf({ ...twig, data_date: null })).toBe("—");
  });
});
