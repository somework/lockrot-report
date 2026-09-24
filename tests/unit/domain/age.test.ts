import { describe, expect, it } from "vitest";
import { ageLegend, ageScale, anyAgeScale, sharedAgeMax } from "../../../src/domain/age";
import { makeFinding, makeSignal } from "./fixtures";

const RELEASE_THRESHOLDS = [
  ["release-warn-years", 3],
  ["release-high-years", 5],
] as const;

const PUSH_THRESHOLDS = [
  ["push-warn-years", 3],
  ["push-high-years", 5],
] as const;

const ALL_THRESHOLDS = [...RELEASE_THRESHOLDS, ...PUSH_THRESHOLDS];

// makeFinding's own default verdict is "abandoned" (contextOnly), which is not what these describes
// are about — a verdict `ageScale` never treats specially keeps every assertion below about the
// scale's own fields, not about PD-ROWS-3's neutral-tone rule (its own describe block, further down).
const AGE_VERDICT = "stale";

describe("ageScale / which signal supplies the years", () => {
  it("reads S8 as a branch age when it carries a numeric years, against the release thresholds", () => {
    // Arrange
    const finding = makeFinding({
      verdict: AGE_VERDICT,
      signals: [makeSignal({ id: "S8", data: { years: 3.1 } })],
    });

    // Act
    const scale = ageScale(finding, RELEASE_THRESHOLDS, 10);

    // Assert
    expect(scale).toEqual({ kind: "branch", years: 3.1, warn: 3, high: 5, max: 10, contextOnly: false });
  });

  it("falls back to S2 as a release age when there is no S8", () => {
    // Arrange
    const finding = makeFinding({
      verdict: AGE_VERDICT,
      signals: [makeSignal({ id: "S2", data: { years: 8.7 } })],
    });

    // Act
    const scale = ageScale(finding, RELEASE_THRESHOLDS, 10);

    // Assert
    expect(scale).toEqual({ kind: "release", years: 8.7, warn: 3, high: 5, max: 10, contextOnly: false });
  });

  it("falls back to S4 as a push age, against the push thresholds, when there is neither S8 nor S2", () => {
    // Arrange
    const finding = makeFinding({
      verdict: AGE_VERDICT,
      signals: [makeSignal({ id: "S4", data: { years: 8.2 } })],
    });

    // Act
    const scale = ageScale(finding, ALL_THRESHOLDS, 10);

    // Assert
    expect(scale).toEqual({ kind: "push", years: 8.2, warn: 3, high: 5, max: 10, contextOnly: false });
  });

  it("prefers S8 over S2 and S4 together (daverandom/resume's own shape)", () => {
    // Arrange
    const finding = makeFinding({
      verdict: AGE_VERDICT,
      signals: [
        makeSignal({ id: "S8", data: { years: 3.1 } }),
        makeSignal({ id: "S2", data: { years: 8.7 } }),
        makeSignal({ id: "S4", data: { years: 8.2 } }),
      ],
    });

    // Act
    const scale = ageScale(finding, ALL_THRESHOLDS, 10);

    // Assert
    expect(scale?.kind).toBe("branch");
    expect(scale?.years).toBe(3.1);
  });

  it("prefers S2 over S4 when there is no S8", () => {
    // Arrange
    const finding = makeFinding({
      verdict: AGE_VERDICT,
      signals: [
        makeSignal({ id: "S2", data: { years: 8.7 } }),
        makeSignal({ id: "S4", data: { years: 8.2 } }),
      ],
    });

    // Act
    const scale = ageScale(finding, ALL_THRESHOLDS, 10);

    // Assert
    expect(scale?.kind).toBe("release");
    expect(scale?.years).toBe(8.7);
  });
});

describe("ageScale / never guesses", () => {
  it("returns null for a finding with no S8/S2/S4 signal at all", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S1" })] });

    // Act + Assert
    expect(ageScale(finding, ALL_THRESHOLDS, 10)).toBeNull();
  });

  it("returns null when the signal's own years is missing", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: {} })] });

    // Act + Assert
    expect(ageScale(finding, RELEASE_THRESHOLDS, 10)).toBeNull();
  });

  it("returns null when years is a non-numeric value, never coerced", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: { years: "8.7" } })] });

    // Act + Assert
    expect(ageScale(finding, RELEASE_THRESHOLDS, 10)).toBeNull();
  });

  it("returns null when the run recorded no matching threshold at all", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: { years: 8.7 } })] });

    // Act + Assert
    expect(ageScale(finding, [], 10)).toBeNull();
  });

  it("returns null when only one of the pair's two thresholds is present", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: { years: 8.7 } })] });

    // Act + Assert
    expect(ageScale(finding, [["release-warn-years", 3]], 10)).toBeNull();
  });
});

describe("ageScale / contextOnly (PD-ROWS-3)", () => {
  it("is true for an abandoned verdict, whose own reason is S1/S3, not age", () => {
    // Arrange
    const finding = makeFinding({
      verdict: "abandoned",
      signals: [makeSignal({ id: "S2", data: { years: 3.5 } })],
    });

    // Act
    const scale = ageScale(finding, RELEASE_THRESHOLDS, 10);

    // Assert
    expect(scale?.contextOnly).toBe(true);
  });

  it("is true for a pinned verdict, whose own reason is S6, not age", () => {
    // Arrange
    const finding = makeFinding({
      verdict: "pinned",
      signals: [makeSignal({ id: "S4", data: { years: 6 } })],
    });

    // Act
    const scale = ageScale(finding, PUSH_THRESHOLDS, 10);

    // Assert
    expect(scale?.contextOnly).toBe(true);
  });

  it.each(["silent", "left-behind", "old-promise", "stale", "unknown", "ok", "finished"])(
    "is false for a %s verdict",
    (verdict) => {
      // Arrange
      const finding = makeFinding({ verdict, signals: [makeSignal({ id: "S2", data: { years: 8.7 } })] });

      // Act
      const scale = ageScale(finding, RELEASE_THRESHOLDS, 10);

      // Assert
      expect(scale?.contextOnly).toBe(false);
    },
  );
});

describe("sharedAgeMax (PD-ROWS-3)", () => {
  it("floors at 10 years when nothing in the list is older", () => {
    // Arrange
    const findings = [
      makeFinding({ verdict: AGE_VERDICT, signals: [makeSignal({ id: "S2", data: { years: 1.2 } })] }),
      makeFinding({ verdict: AGE_VERDICT, signals: [makeSignal({ id: "S2", data: { years: 4 } })] }),
    ];

    // Act + Assert
    expect(sharedAgeMax(findings, RELEASE_THRESHOLDS)).toBe(10);
  });

  it("takes the largest ceil(years) across every row that would draw a scale", () => {
    // Arrange
    const findings = [
      makeFinding({ verdict: AGE_VERDICT, signals: [makeSignal({ id: "S2", data: { years: 4 } })] }),
      makeFinding({ verdict: AGE_VERDICT, signals: [makeSignal({ id: "S2", data: { years: 12.3 } })] }),
      makeFinding({ verdict: AGE_VERDICT, signals: [makeSignal({ id: "S2", data: { years: 8 } })] }),
    ];

    // Act + Assert
    expect(sharedAgeMax(findings, RELEASE_THRESHOLDS)).toBe(13);
  });

  it("ignores a row that would draw no scale of its own (no signal, or a missing threshold)", () => {
    // Arrange
    const findings = [
      makeFinding({ verdict: AGE_VERDICT, signals: [makeSignal({ id: "S1" })] }),
      makeFinding({ verdict: AGE_VERDICT, signals: [makeSignal({ id: "S4", data: { years: 40 } })] }),
    ];

    // Act: no push-* thresholds recorded, so the S4 row above draws nothing either.
    expect(sharedAgeMax(findings, RELEASE_THRESHOLDS)).toBe(10);
  });

  it("returns 10 for an empty list", () => {
    expect(sharedAgeMax([], RELEASE_THRESHOLDS)).toBe(10);
  });
});

describe("anyAgeScale (PD-ROWS-3)", () => {
  it("is false when no row in the list would draw a scale", () => {
    const findings = [makeFinding({ signals: [makeSignal({ id: "S1" })] })];
    expect(anyAgeScale(findings, RELEASE_THRESHOLDS)).toBe(false);
  });

  it("is true when at least one row would draw a scale", () => {
    const findings = [
      makeFinding({ signals: [makeSignal({ id: "S1" })] }),
      makeFinding({ signals: [makeSignal({ id: "S2", data: { years: 4 } })] }),
    ];
    expect(anyAgeScale(findings, RELEASE_THRESHOLDS)).toBe(true);
  });
});

describe("ageLegend (PD-ROWS-3)", () => {
  it("names the release pair when the run recorded it", () => {
    expect(ageLegend(ALL_THRESHOLDS)).toEqual({ warn: 3, high: 5 });
  });

  it("falls back to the push pair when the release pair is incomplete", () => {
    expect(ageLegend(PUSH_THRESHOLDS)).toEqual({ warn: 3, high: 5 });
  });

  it("returns null when neither pair is complete", () => {
    expect(ageLegend([["release-warn-years", 3]])).toBeNull();
  });

  it("returns null for an empty thresholds array", () => {
    expect(ageLegend([])).toBeNull();
  });
});
