import { describe, expect, test } from "vitest";
import {
  DOCS_URL,
  SIGNAL_DEFS,
  SIGNAL_NAMES,
  TONE,
  annotateThresholds,
  signalDef,
  signalDocUrl,
} from "../../../src/domain/vocab";

/** Ids a plain `{}` literal would resolve as inherited `Object.prototype` members instead of
 *  `undefined` — the vocabTable() prototype-pollution regression this file guards against. */
const POLLUTION_IDS: readonly string[] = ["constructor", "__proto__", "toString", "hasOwnProperty"];

describe("TONE", () => {
  test("maps every grade key", () => {
    expect(TONE("critical")).toBe("crit");
    expect(TONE("high")).toBe("high");
    expect(TONE("medium")).toBe("med");
    expect(TONE("low")).toBe("low");
    expect(TONE("none")).toBe("none");
  });

  test("maps every score-0 verdict key", () => {
    expect(TONE("unknown")).toBe("low");
    expect(TONE("finished")).toBe("none");
    expect(TONE("ok")).toBe("none");
  });

  test("falls back to 'low' for a key it does not know, rather than throwing", () => {
    expect(TONE("moderate")).toBe("low");
    expect(TONE("")).toBe("low");
  });

  test("never returns an inherited Object.prototype member for a prototype-pollution id", () => {
    // `{}` inherits `constructor`, a value `?? "low"` would never catch.
    expect(TONE("constructor")).toBe("low");
    expect(TONE("__proto__")).toBe("low");
    expect(TONE("toString")).toBe("low");
    expect(TONE("hasOwnProperty")).toBe("low");
  });
});

describe("SIGNAL_NAMES / SIGNAL_DEFS", () => {
  test("cover S1 through S10", () => {
    for (const id of ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]) {
      expect(SIGNAL_NAMES[id]).toBeTruthy();
      expect(SIGNAL_DEFS[id]).toBeTruthy();
    }
  });

  test("S10 is named, fixing DESIGN.md M2 (the legacy page shipped it with no name at all)", () => {
    expect(SIGNAL_NAMES.S10).toBe("a check could not run");
    expect(SIGNAL_DEFS.S10).toBe(
      "A check lockrot relies on could not run for this package, so a verdict may be missing a signal; the data says which and why.",
    );
  });

  test("give no inherited Object.prototype member for a prototype-pollution id", () => {
    // A non-literal key reads `.toString` as a plain lookup, as a report's id does at runtime.
    for (const id of POLLUTION_IDS) {
      expect(SIGNAL_NAMES[id]).toBeUndefined();
      expect(SIGNAL_DEFS[id]).toBeUndefined();
    }
  });
});

describe("annotateThresholds (PD-GLOSSARY-8, DESIGN.md §5)", () => {
  test("leads with the run's own value, the config key name kept beside it", () => {
    const text = SIGNAL_DEFS.S2 ?? "";
    const annotated = annotateThresholds(text, [
      ["release-warn-years", 3],
      ["release-high-years", 5],
    ]);
    expect(annotated).toBe(
      "Time since the newest dated release, pre-releases included, against 3 years (release-warn-years) / 5 years (release-high-years).",
    );
  });

  test("annotates every occurrence in the same sentence, not just the first", () => {
    const text =
      "No release for release-high-years, and no push for push-high-years; release-high-years again.";
    const annotated = annotateThresholds(text, [
      ["release-high-years", 5],
      ["push-high-years", 5],
    ]);
    expect(annotated).toBe(
      "No release for 5 years (release-high-years), and no push for 5 years (push-high-years); 5 years (release-high-years) again.",
    );
  });

  test("leaves a name the run never recorded exactly as written", () => {
    const text = SIGNAL_DEFS.S2 ?? "";
    expect(annotateThresholds(text, [])).toBe(text);
    expect(annotateThresholds(text, [["push-high-years", 5]])).toBe(text);
  });

  test("leaves text with no config key name at all untouched", () => {
    expect(annotateThresholds("The verdict sets a base.", [["release-warn-years", 3]])).toBe(
      "The verdict sets a base.",
    );
  });
});

describe("S2's names (PD-S6-1)", () => {
  test("never say 'stable': S2 counts every tag, a pre-release included", () => {
    for (const name of [SIGNAL_NAMES.S2, SIGNAL_DEFS.S2]) {
      expect(name).toBeTruthy();
      expect(name).not.toMatch(/stable/i);
    }
    expect(SIGNAL_NAMES.S2).toBe("no recent release");
    expect(SIGNAL_DEFS.S8).toMatch(/stable/);
  });
});

describe("S6's names (PD-S6-1)", () => {
  test("never reads as S2, and never says 'stable'", () => {
    for (const name of [SIGNAL_NAMES.S6, SIGNAL_DEFS.S6]) {
      expect(name).toBeTruthy();
      expect(name).not.toMatch(/stable/i);
    }
    expect(SIGNAL_NAMES.S6).toBe("branch snapshot or never tagged");
  });
});

describe("signal ids this page does not know (0.13 open vocabulary)", () => {
  test("a known id keeps its definition; an unknown one is described by the shape of its id", () => {
    expect(signalDef("S8")).toBe(SIGNAL_DEFS.S8);
    // `S` and a number is lockrot's own check, newer than this page.
    expect(signalDef("S99")).toBe("A lockrot check this page does not know.");
    // `<vendor>:<name>` is, in the report schema's words, one that does not come from lockrot.
    expect(signalDef("acme:licence")).toBe("A check from outside lockrot, which this page does not know.");
    // Anything else says nothing about where it came from, and is never read as an inherited key.
    for (const id of ["S01", "", "sbom lookup", ...POLLUTION_IDS]) {
      expect(signalDef(id)).toBe("A check this page does not know.");
    }
  });

  test("links lockrot's own ids to lockrot's docs, and an id that is not lockrot's nowhere", () => {
    expect(signalDocUrl("S7")).toBe(`${DOCS_URL}#transitive-exposure`);
    expect(signalDocUrl("S8")).toBe(`${DOCS_URL}#left-behind`);
    expect(signalDocUrl("S9")).toBe(`${DOCS_URL}#security-advisories`);
    expect(signalDocUrl("S2")).toBe(`${DOCS_URL}#the-signals`);
    expect(signalDocUrl("S99")).toBe(`${DOCS_URL}#the-signals`);
    expect(signalDocUrl("acme:licence")).toBeNull();
    for (const id of ["S01", "", ...POLLUTION_IDS]) {
      expect(signalDocUrl(id)).toBeNull();
    }
  });
});
