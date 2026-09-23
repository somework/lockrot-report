import { describe, expect, it } from "vitest";
import { SEVERITY_ORDER, normalizeSeverity, severityRank } from "../../../src/domain/severity";

describe("normalizeSeverity", () => {
  it("maps the four named tiers to themselves", () => {
    // Arrange / Act / Assert
    expect(normalizeSeverity("critical")).toBe("critical");
    expect(normalizeSeverity("high")).toBe("high");
    expect(normalizeSeverity("medium")).toBe("medium");
    expect(normalizeSeverity("low")).toBe("low");
  });

  it("is case-insensitive", () => {
    // Arrange
    const raw = "HIGH";

    // Act
    const result = normalizeSeverity(raw);

    // Assert
    expect(result).toBe("high");
  });

  it("folds moderate into medium", () => {
    // Arrange
    const raw = "Moderate";

    // Act
    const result = normalizeSeverity(raw);

    // Assert
    expect(result).toBe("medium");
  });

  it("maps null to unrated", () => {
    // Arrange / Act / Assert
    expect(normalizeSeverity(null)).toBe("unrated");
  });

  it("maps an unknown free-text severity to unrated", () => {
    // Arrange
    const raw = "informational";

    // Act
    const result = normalizeSeverity(raw);

    // Assert
    expect(result).toBe("unrated");
  });
});

describe("severityRank", () => {
  it("ranks the tiers worst first", () => {
    // Arrange / Act / Assert
    expect(severityRank("critical")).toBeLessThan(severityRank("high"));
    expect(severityRank("high")).toBeLessThan(severityRank("medium"));
    expect(severityRank("medium")).toBeLessThan(severityRank("low"));
  });

  it("ranks unrated last, not first (critic.md C1)", () => {
    // Arrange / Act / Assert
    expect(severityRank("unrated")).toBe(SEVERITY_ORDER.length - 1);
    expect(severityRank("unrated")).toBeGreaterThan(severityRank("low"));
  });
});
