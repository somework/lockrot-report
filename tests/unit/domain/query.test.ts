import { describe, expect, it } from "vitest";
import { matchesAdvisory, matchesFinding, parseQuery } from "../../../src/domain/query";
import { makeAdvisory, makeFinding, makeSignal } from "./fixtures";

describe("parseQuery", () => {
  it("splits on whitespace and lower-cases free text (lib.test.js:174)", () => {
    // Arrange
    const raw = "Guzzle  HTTP";

    // Act
    const terms = parseQuery(raw);

    // Assert
    expect(terms).toEqual([
      { field: null, value: "guzzle" },
      { field: null, value: "http" },
    ]);
  });

  it.each(["", "   "])("returns no terms for %j (lib.test.js:175-176)", (raw) => {
    // Act
    const terms = parseQuery(raw);

    // Assert
    expect(terms).toEqual([]);
  });

  it("widens a repeated verdict key instead of overwriting it (lib.test.js:182)", () => {
    // Arrange
    const raw = "verdict:silent verdict:abandoned";

    // Act
    const terms = parseQuery(raw);

    // Assert
    expect(terms).toEqual([
      { field: "verdict", value: "silent" },
      { field: "verdict", value: "abandoned" },
    ]);
  });

  it("upper-cases signal/cve values and lower-cases severity (lib.test.js:187-189)", () => {
    // Arrange
    const raw = "signal:s9 cve:cve-2022-31090 severity:Critical";

    // Act
    const terms = parseQuery(raw);

    // Assert
    expect(terms).toEqual([
      { field: "signal", value: "S9" },
      { field: "cve", value: "CVE-2022-31090" },
      { field: "severity", value: "critical" },
    ]);
  });

  it("lower-cases priority values, unlike signal/cve (the untested parity gap lib.md flags)", () => {
    // Arrange
    const raw = "priority:CRITICAL";

    // Act
    const terms = parseQuery(raw);

    // Assert
    expect(terms).toEqual([{ field: "priority", value: "critical" }]);
  });

  it.each([
    ["direct:yes", "true"],
    ["direct:true", "true"],
    ["direct:1", "true"],
    ["direct:no", "false"],
    ["dev:anything-else", "false"],
  ])("parses %j as %j (lib.test.js:193-197)", (raw, expected) => {
    // Act
    const terms = parseQuery(raw);

    // Assert
    expect(terms).toHaveLength(1);
    expect(terms[0]?.value).toBe(expected);
  });

  it("leaves no direct term at all for a query that never mentions it (lib.test.js:198)", () => {
    // Act
    const terms = parseQuery("guzzle");

    // Assert
    expect(terms.some((term) => term.field === "direct")).toBe(false);
  });

  it("treats an unknown key:value shape as one free-text token (lib.test.js:202)", () => {
    // Act
    const terms = parseQuery("license:mit");

    // Assert
    expect(terms).toEqual([{ field: null, value: "license:mit" }]);
  });
});

describe("matchesFinding / free text", () => {
  it("requires every text token to be a substring of package+version+verdict+evidence", () => {
    // Arrange
    const finding = makeFinding({ package: "acme/widget", version: "1.2.3", evidence: "archived upstream" });
    const hit = parseQuery("widget archived");
    const miss = parseQuery("widget missing");

    // Act / Assert
    expect(matchesFinding(finding, hit)).toBe(true);
    expect(matchesFinding(finding, miss)).toBe(false);
  });

  it("is case-insensitive against the finding's own text", () => {
    // Arrange
    const finding = makeFinding({ package: "Acme/Widget" });
    const terms = parseQuery("acme/widget");

    // Act
    const result = matchesFinding(finding, terms);

    // Assert
    expect(result).toBe(true);
  });
});

describe("matchesFinding / field terms", () => {
  it("ORs repeated verdict terms", () => {
    // Arrange
    const finding = makeFinding({ verdict: "silent" });
    const terms = parseQuery("verdict:stale verdict:silent");

    // Act
    const result = matchesFinding(finding, terms);

    // Assert
    expect(result).toBe(true);
  });

  it("rejects a verdict term the finding does not carry", () => {
    // Arrange
    const finding = makeFinding({ verdict: "silent" });
    const terms = parseQuery("verdict:stale");

    // Act
    const result = matchesFinding(finding, terms);

    // Assert
    expect(result).toBe(false);
  });

  it("filters on priority", () => {
    // Arrange
    const finding = makeFinding({ priority: "medium" });
    const terms = parseQuery("priority:medium");

    // Act / Assert
    expect(matchesFinding(finding, terms)).toBe(true);
    expect(matchesFinding(finding, parseQuery("priority:high"))).toBe(false);
  });

  it("requires an exact match on direct:/dev:, and only the last occurrence counts", () => {
    // Arrange
    const finding = makeFinding({ direct: true, dev: false });

    // Act / Assert
    expect(matchesFinding(finding, parseQuery("direct:yes"))).toBe(true);
    expect(matchesFinding(finding, parseQuery("direct:no"))).toBe(false);
    // "direct:yes direct:no" — the second occurrence overwrites the first (lib.js:206).
    expect(matchesFinding(finding, parseQuery("direct:yes direct:no"))).toBe(false);
    expect(matchesFinding(finding, parseQuery("dev:yes"))).toBe(false);
  });

  it("ANDs every queried signal id, unlike the rail's OR (report.js:214-217)", () => {
    // Arrange
    const finding = makeFinding({ signals: [makeSignal({ id: "S1" }), makeSignal({ id: "S9" })] });

    // Act / Assert
    expect(matchesFinding(finding, parseQuery("signal:S1"))).toBe(true);
    expect(matchesFinding(finding, parseQuery("signal:S1 signal:S9"))).toBe(true);
    expect(matchesFinding(finding, parseQuery("signal:S1 signal:S2"))).toBe(false);
  });

  it("requires at least one advisory whose CVE (or id, when it has none) contains the term", () => {
    // Arrange
    const withCve = makeFinding({ advisories: [makeAdvisory({ cve: "CVE-2022-31090" })] });
    const withoutCve = makeFinding({ advisories: [makeAdvisory({ cve: null, id: "GHSA-1234" })] });

    // Act / Assert
    expect(matchesFinding(withCve, parseQuery("cve:2022-31090"))).toBe(true);
    expect(matchesFinding(withCve, parseQuery("cve:1999-00000"))).toBe(false);
    expect(matchesFinding(withoutCve, parseQuery("cve:1234"))).toBe(true);
  });
});

describe("matchesFinding / severity (critic.md M1 fix)", () => {
  it("matches a moderate-labelled advisory on both its raw text and its normalised bucket", () => {
    // Arrange: an advisory feed's own "moderate" tier, normalised to lockrot's "medium" bucket —
    // domain/severity.ts's job, replicated here the way normalize() would have already done it.
    const finding = makeFinding({
      advisories: [makeAdvisory({ severityRaw: "Moderate", severity: "medium" })],
    });

    // Act / Assert
    expect(matchesFinding(finding, parseQuery("severity:moderate"))).toBe(true);
    expect(matchesFinding(finding, parseQuery("severity:medium"))).toBe(true);
    expect(matchesFinding(finding, parseQuery("severity:high"))).toBe(false);
  });

  it("matches an advisory with no feed severity on severity:unrated", () => {
    // Arrange
    const finding = makeFinding({ advisories: [makeAdvisory({ severityRaw: null, severity: "unrated" })] });

    // Act
    const result = matchesFinding(finding, parseQuery("severity:unrated"));

    // Assert
    expect(result).toBe(true);
  });
});

describe("matchesAdvisory", () => {
  it("applies the same severity fix as matchesFinding, but to one advisory", () => {
    // Arrange
    const advisory = makeAdvisory({ severityRaw: "Moderate", severity: "medium" });
    const finding = makeFinding({ advisories: [advisory] });

    // Act / Assert
    expect(matchesAdvisory(advisory, finding, parseQuery("severity:moderate"))).toBe(true);
    expect(matchesAdvisory(advisory, finding, parseQuery("severity:medium"))).toBe(true);
    expect(matchesAdvisory(advisory, finding, parseQuery("severity:low"))).toBe(false);
  });

  it("matches on a substring of the CVE id", () => {
    // Arrange
    const advisory = makeAdvisory({ cve: "CVE-2022-31090" });
    const finding = makeFinding({ advisories: [advisory] });

    // Act / Assert
    expect(matchesAdvisory(advisory, finding, parseQuery("cve:31090"))).toBe(true);
    expect(matchesAdvisory(advisory, finding, parseQuery("cve:99999"))).toBe(false);
  });

  it("passes every advisory when the query carries no severity/cve term", () => {
    // Arrange
    const advisory = makeAdvisory();
    const finding = makeFinding({ advisories: [advisory] });

    // Act
    const result = matchesAdvisory(advisory, finding, parseQuery("guzzle"));

    // Assert
    expect(result).toBe(true);
  });
});
