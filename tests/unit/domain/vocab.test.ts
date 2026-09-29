import { describe, expect, test } from "vitest";
import { RAIL_SIGNAL_LABELS } from "../../../src/domain/filters";
import {
  CHECK_NAMES,
  DEFAULT_FLAGGED,
  DOCS_URL,
  SIGNAL_DEFS,
  SIGNAL_DOC,
  SIGNAL_NAMES,
  TONE,
  VERDICT_DEFS,
  VERDICT_ORDER,
  annotateThresholds,
  isFlagged,
  isKnownSignalId,
  signalDef,
  signalDocUrl,
} from "../../../src/domain/vocab";

/** Ids a plain `{}` literal would resolve as inherited `Object.prototype` members instead of
 *  `undefined` — the vocabTable() prototype-pollution regression this file guards against. */
const POLLUTION_IDS: readonly string[] = ["constructor", "__proto__", "toString", "hasOwnProperty"];

describe("DEFAULT_FLAGGED", () => {
  test("is the six rot verdicts, excluding unknown", () => {
    expect(DEFAULT_FLAGGED).toEqual(["abandoned", "silent", "pinned", "left-behind", "old-promise", "stale"]);
    expect(DEFAULT_FLAGGED).not.toContain("unknown");
    expect(DEFAULT_FLAGGED).not.toContain("finished");
    expect(DEFAULT_FLAGGED).not.toContain("ok");
  });
});

describe("VERDICT_ORDER", () => {
  test("is the legacy SEVERITY_ORDER: the six flagged verdicts plus unknown, excluding finished/ok", () => {
    expect(VERDICT_ORDER).toEqual([
      "abandoned",
      "silent",
      "pinned",
      "left-behind",
      "old-promise",
      "stale",
      "unknown",
    ]);
  });
});

describe("TONE", () => {
  test("maps every priority key", () => {
    expect(TONE("critical")).toBe("crit");
    expect(TONE("high")).toBe("high");
    expect(TONE("medium")).toBe("med");
    expect(TONE("low")).toBe("low");
    expect(TONE("none")).toBe("none");
  });

  test("maps every verdict key", () => {
    expect(TONE("abandoned")).toBe("crit");
    expect(TONE("silent")).toBe("crit");
    expect(TONE("pinned")).toBe("high");
    expect(TONE("left-behind")).toBe("high");
    expect(TONE("old-promise")).toBe("med");
    expect(TONE("stale")).toBe("med");
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

describe("VERDICT_DEFS", () => {
  test("has one entry per verdict, all nine", () => {
    for (const v of [
      "abandoned",
      "silent",
      "pinned",
      "left-behind",
      "old-promise",
      "stale",
      "unknown",
      "finished",
      "ok",
    ]) {
      expect(VERDICT_DEFS[v]).toBeTruthy();
    }
  });

  test("gives no inherited Object.prototype member for a prototype-pollution id", () => {
    for (const id of POLLUTION_IDS) {
      expect(VERDICT_DEFS[id]).toBeUndefined();
    }
  });
});

describe("SIGNAL_DOC", () => {
  test("has dedicated anchors only for S7, S8 and S9", () => {
    expect(SIGNAL_DOC.S7).toBe(`${DOCS_URL}#transitive-exposure`);
    expect(SIGNAL_DOC.S8).toBe(`${DOCS_URL}#left-behind`);
    expect(SIGNAL_DOC.S9).toBe(`${DOCS_URL}#security-advisories`);
    expect(SIGNAL_DOC.S1).toBeUndefined();
    expect(SIGNAL_DOC.S10).toBeUndefined();
  });

  test("gives no inherited Object.prototype member for a prototype-pollution id", () => {
    // SignalId admits any string at the type level, so a document-supplied id can reach this
    // lookup; cast is only to exercise that at the type level too.
    expect(SIGNAL_DOC["constructor" as never]).toBeUndefined();
    expect(SIGNAL_DOC["toString" as never]).toBeUndefined();
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
    const text = VERDICT_DEFS.silent ?? "";
    const annotated = annotateThresholds(text, [
      ["release-high-years", 5],
      ["push-high-years", 5],
    ]);
    expect(annotated).toBe(
      "No release for at least 5 years (release-high-years), pre-releases included, and no repository push for at least 5 years (push-high-years).",
    );
  });

  test("leaves a name the run never recorded exactly as written", () => {
    const text = VERDICT_DEFS["left-behind"] ?? "";
    expect(annotateThresholds(text, [])).toBe(text);
    expect(annotateThresholds(text, [["push-high-years", 5]])).toBe(text);
  });

  test("leaves text with no config key name at all untouched", () => {
    expect(annotateThresholds("The verdict sets a base.", [["release-warn-years", 3]])).toBe(
      "The verdict sets a base.",
    );
  });
});

describe("isFlagged", () => {
  test("is true for a verdict in the given list, false otherwise", () => {
    expect(isFlagged("abandoned", DEFAULT_FLAGGED)).toBe(true);
    expect(isFlagged("ok", DEFAULT_FLAGGED)).toBe(false);
    expect(isFlagged("unknown", DEFAULT_FLAGGED)).toBe(false);
  });

  test("respects a run's own flaggedVerdicts list rather than the default", () => {
    expect(isFlagged("unknown", ["unknown"])).toBe(true);
    expect(isFlagged("abandoned", ["unknown"])).toBe(false);
  });
});

describe("S2's names (PD-S6-1)", () => {
  test("never say 'stable': S2 counts every tag, a pre-release included", () => {
    for (const name of [SIGNAL_NAMES.S2, RAIL_SIGNAL_LABELS.S2, SIGNAL_DEFS.S2, VERDICT_DEFS.silent]) {
      expect(name).toBeTruthy();
      expect(name).not.toMatch(/stable/i);
    }
    expect(SIGNAL_NAMES.S2).toBe("no recent release");
    expect(SIGNAL_DEFS.S8).toMatch(/stable/);
  });
});

describe("S6's names (PD-S6-1)", () => {
  test("never reads as S2, and never says 'stable'", () => {
    const names = [
      SIGNAL_NAMES.S6,
      CHECK_NAMES.S6,
      RAIL_SIGNAL_LABELS.S6,
      SIGNAL_DEFS.S6,
      VERDICT_DEFS.pinned,
    ];
    for (const name of names) {
      expect(name).toBeTruthy();
      expect(name).not.toMatch(/stable/i);
    }
    expect(SIGNAL_NAMES.S6).toBe("branch snapshot or never tagged");
    expect(CHECK_NAMES.S6).toBe("snapshot/untagged");
    expect(RAIL_SIGNAL_LABELS.S6).toBe("snapshot or untagged");
  });
});

describe("signal ids this page does not know (0.13 open vocabulary)", () => {
  test("the rail's own labels hold no inherited key either", () => {
    for (const id of POLLUTION_IDS) {
      expect(RAIL_SIGNAL_LABELS[id]).toBeUndefined();
    }
  });

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
    expect(signalDocUrl("S8")).toBe(`${DOCS_URL}#left-behind`);
    expect(signalDocUrl("S2")).toBe(`${DOCS_URL}#the-signals`);
    expect(signalDocUrl("S99")).toBe(`${DOCS_URL}#the-signals`);
    expect(signalDocUrl("acme:licence")).toBeNull();
    for (const id of ["S01", "", ...POLLUTION_IDS]) {
      expect(signalDocUrl(id)).toBeNull();
    }
  });

  test("knows S1 to S10 and nothing else", () => {
    expect(["S1", "S6", "S10"].map(isKnownSignalId)).toEqual([true, true, true]);
    expect(["S11", "S99", "acme:licence", "s1", ...POLLUTION_IDS].map(isKnownSignalId).every((k) => !k)).toBe(
      true,
    );
  });
});
