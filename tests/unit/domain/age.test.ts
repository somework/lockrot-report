import { describe, expect, it } from "vitest";
import { ageScale } from "../../../src/domain/age";
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

describe("ageScale / which signal supplies the years", () => {
  it("reads S8 as a branch age when it carries a numeric years, against the release thresholds", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S8", data: { years: 3.1 } })] });

    // Act
    const scale = ageScale(finding, RELEASE_THRESHOLDS);

    // Assert
    expect(scale).toEqual({ kind: "branch", years: 3.1, warn: 3, high: 5, max: 10 });
  });

  it("falls back to S2 as a release age when there is no S8", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: { years: 8.7 } })] });

    // Act
    const scale = ageScale(finding, RELEASE_THRESHOLDS);

    // Assert
    expect(scale).toEqual({ kind: "release", years: 8.7, warn: 3, high: 5, max: 10 });
  });

  it("falls back to S4 as a push age, against the push thresholds, when there is neither S8 nor S2", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S4", data: { years: 8.2 } })] });

    // Act
    const scale = ageScale(finding, ALL_THRESHOLDS);

    // Assert
    expect(scale).toEqual({ kind: "push", years: 8.2, warn: 3, high: 5, max: 10 });
  });

  it("prefers S8 over S2 and S4 together (daverandom/resume's own shape)", () => {
    // Arrange
    const finding = makeFinding({
      signals: [
        makeSignal({ id: "S8", data: { years: 3.1 } }),
        makeSignal({ id: "S2", data: { years: 8.7 } }),
        makeSignal({ id: "S4", data: { years: 8.2 } }),
      ],
    });

    // Act
    const scale = ageScale(finding, ALL_THRESHOLDS);

    // Assert
    expect(scale?.kind).toBe("branch");
    expect(scale?.years).toBe(3.1);
  });

  it("prefers S2 over S4 when there is no S8", () => {
    // Arrange
    const finding = makeFinding({
      signals: [
        makeSignal({ id: "S2", data: { years: 8.7 } }),
        makeSignal({ id: "S4", data: { years: 8.2 } }),
      ],
    });

    // Act
    const scale = ageScale(finding, ALL_THRESHOLDS);

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
    expect(ageScale(finding, ALL_THRESHOLDS)).toBeNull();
  });

  it("returns null when the signal's own years is missing", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: {} })] });

    // Act + Assert
    expect(ageScale(finding, RELEASE_THRESHOLDS)).toBeNull();
  });

  it("returns null when years is a non-numeric value, never coerced", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: { years: "8.7" } })] });

    // Act + Assert
    expect(ageScale(finding, RELEASE_THRESHOLDS)).toBeNull();
  });

  it("returns null when the run recorded no matching threshold at all", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: { years: 8.7 } })] });

    // Act + Assert
    expect(ageScale(finding, [])).toBeNull();
  });

  it("returns null when only one of the pair's two thresholds is present", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: { years: 8.7 } })] });

    // Act + Assert
    expect(ageScale(finding, [["release-warn-years", 3]])).toBeNull();
  });
});

describe("ageScale / max", () => {
  it("floors the track at 10 years for a young package", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: { years: 1.2 } })] });

    // Act
    const scale = ageScale(finding, RELEASE_THRESHOLDS);

    // Assert
    expect(scale?.max).toBe(10);
  });

  it("rounds a package older than 10 years up to the next whole year", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S2", data: { years: 12.3 } })] });

    // Act
    const scale = ageScale(finding, RELEASE_THRESHOLDS);

    // Assert
    expect(scale?.max).toBe(13);
  });
});
