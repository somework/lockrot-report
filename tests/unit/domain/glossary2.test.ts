import { describe, expect, it } from "vitest";
import {
  flagEntries,
  flagsHeading,
  signalEntries,
  verdictEntries,
  verdictsHeading,
} from "../../../src/domain/glossary2";
import type { Report2 } from "../../../src/model/report2";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;

describe("the report-2 glossary", () => {
  it("heads its sections with the run's own counts", () => {
    expect(verdictsHeading(composite.run)).toBe("The seven verdicts");
    expect(flagsHeading(composite.run)).toBe("The seven flags");
  });

  it("words a grade from its band floor and a score-0 verdict from its reason", () => {
    const byId = Object.fromEntries(verdictEntries(composite).map((entry) => [entry.id, entry]));
    expect(byId.critical).toEqual({ id: "critical", count: 3, text: "A score from 32: a critical finding." });
    expect(byId.high?.text).toBe("A score from 16: a serious finding.");
    expect(byId.finished?.text).toBe("A score of 0: accepted by an allowlist.");
    expect(byId.unknown?.text).toBe("A score of 0: no metadata.");
    expect(byId.ok?.text).toBe("A score of 0, and no flag counts.");
  });

  it("takes a band floor from the model, never from the page", () => {
    const run = {
      ...composite.run,
      score_model: {
        ...composite.run.score_model,
        bands: composite.run.score_model.bands.map((band) => ({ ...band, floor: band.floor * 3 })),
      },
    };
    const [critical] = verdictEntries({ ...composite, run });
    expect(critical?.text).toBe("A score from 96: a critical finding.");
  });

  it("lists every flag in flag order with its carriers, signals and this run's thresholds", () => {
    const entries = flagEntries(composite);
    expect(entries.map((entry) => entry.id)).toEqual(composite.run.flag_ids);
    const silent = entries.find((entry) => entry.id === "silent");
    expect(silent?.text).toContain("5 years (release-high-years)");
    expect(silent?.text).toContain("Signals: S2, S4.");
    expect(entries.find((entry) => entry.id === "vulnerable")?.count).toBe(4);
  });

  it("names every signal of the run, S9 by its report-2 meaning", () => {
    const entries = signalEntries(composite.run);
    expect(entries.map((entry) => entry.id)).toEqual(composite.run.signal_ids);
    expect(entries.find((entry) => entry.id === "S9")).toEqual({
      id: "S9",
      name: "advisories",
      text: "Advisories on the installed version; raises the vulnerable flag.",
    });
  });
});
