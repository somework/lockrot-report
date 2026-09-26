import { describe, expect, it } from "vitest";
import { answerParts, answerText, pulledIn, pulledVerdicts, yearsPhrase } from "../../../src/domain/answer";
import { ageFact } from "../../../src/domain/age";
import { makeAdvisory, makeFinding, makeSignal } from "./fixtures";

const THRESHOLDS = [
  ["release-warn-years", 3],
  ["release-high-years", 5],
  ["push-warn-years", 3],
  ["push-high-years", 5],
] as const;

function answer(overrides: Parameters<typeof makeFinding>[0], metadataReplacement: string | null = null) {
  return answerParts({ finding: makeFinding(overrides), metadataReplacement, thresholds: THRESHOLDS });
}

describe("answerParts", () => {
  it("says an abandoned, archived, direct package's case with its named replacement", () => {
    // Arrange / Act
    const parts = answer(
      {
        verdict: "abandoned",
        direct: true,
        chain: ["acme/widget"],
        signals: [
          makeSignal({ id: "S1", data: { replacement: "Symfony" } }),
          makeSignal({ id: "S3", data: { host: "github.com" } }),
          makeSignal({ id: "S4", data: { years: 3.6 } }),
        ],
      },
      "Symfony",
    );

    // Assert
    expect(answerText(parts)).toBe(
      "Marked abandoned upstream and archived on GitHub, with no push for 3.6 years. You require it directly. Its named replacement is Symfony, in words only — not a package lockrot resolved.",
    );
    // Abandoned never rests on age: the years are a figure in ink, not the zone's tone.
    expect(parts.find((p) => p.kind === "figure")).toEqual({ kind: "figure", text: "3.6 years", tone: null });
    expect(parts.find((p) => p.kind === "replacement")).toEqual({
      kind: "replacement",
      text: "Symfony",
      linked: false,
    });
  });

  it("quotes the same age the key facts do for an abandoned package: S8, then S2, then S4", () => {
    // Arrange: S2 and S4 both fired; the fact and the row read S2, so the sentence must too.
    const released = answer({
      verdict: "abandoned",
      signals: [
        makeSignal({ id: "S1" }),
        makeSignal({ id: "S2", data: { years: 9.1 } }),
        makeSignal({ id: "S4", data: { years: 5.4 } }),
      ],
    });
    const branch = answer({
      verdict: "abandoned",
      signals: [
        makeSignal({ id: "S8", data: { branch: "1.x", years: 9.7 } }),
        makeSignal({ id: "S2", data: { years: 9.1 } }),
      ],
    });

    // Act / Assert
    expect(answerText(released)).toBe(
      "Marked abandoned upstream; its last release was 9.1 years ago. You require it directly.",
    );
    expect(answerText(branch)).toBe(
      "Abandoned; the branch you’re on, 1.x, last released 9.7 years ago. You require it directly.",
    );
  });

  it("links the replacement only when lockrot resolved it to a package name", () => {
    const parts = answer({ verdict: "abandoned", replacement: "vendor/successor" }, "free text");
    expect(parts.find((p) => p.kind === "replacement")).toEqual({
      kind: "replacement",
      text: "vendor/successor",
      linked: true,
    });
  });

  it("says a left-behind package's branch, age in its zone's tone, way in and unfixable advisories", () => {
    // Arrange / Act
    const parts = answer({
      verdict: "left-behind",
      direct: false,
      chain: ["scheb/2fa-google-authenticator", "spomky-labs/otphp"],
      directDependents: ["scheb/2fa-google-authenticator"],
      signals: [makeSignal({ id: "S8", data: { branch: "10.x", years: 4.5, newest_branch: "11.x" } })],
      advisories: [makeAdvisory(), makeAdvisory({ id: "GHSA-2" })],
      evidence: "branch 10.x last released …; no fix expected on 10.x",
    });

    // Assert
    expect(answerText(parts)).toBe(
      "Left behind on 10.x: its last release was 4.5 years ago while 11.x kept releasing. It comes in through scheb/2fa-google-authenticator. 2 security advisories affect your version and no fix is coming on 10.x.",
    );
    expect(parts.filter((p) => p.kind === "figure")).toEqual([
      { kind: "figure", text: "4.5 years", tone: "med" },
      { kind: "figure", text: "2 security advisories", tone: "crit" },
    ]);
  });

  it("names the one fix every advisory shares", () => {
    const parts = answer({
      verdict: "stale",
      signals: [makeSignal({ id: "S2", data: { years: 3.3 } })],
      advisories: [makeAdvisory({ fixedBy: "2.0.1" })],
    });
    expect(answerText(parts)).toBe(
      "Stale: its last release was 3.3 years ago. You require it directly. 1 security advisory affects your version; 2.0.1 fixes it.",
    );
  });

  it("counts other direct requirements beyond one, and says a dev-only package is dev-only", () => {
    const parts = answer({
      verdict: "silent",
      direct: false,
      dev: true,
      chain: ["a/one", "acme/widget"],
      directDependents: ["a/one", "b/two", "c/three"],
      signals: [
        makeSignal({ id: "S2", data: { years: 9.3 } }),
        makeSignal({ id: "S4", data: { years: 0.4 } }),
      ],
    });
    expect(answerText(parts)).toBe(
      "Silent: no release for 9.3 years and no push for 5 months. It comes in through 3 of your requirements, a/one among them, for development only.",
    );
    expect(parts.filter((p) => p.kind === "figure")).toEqual([
      { kind: "figure", text: "9.3 years", tone: "crit" },
      { kind: "figure", text: "5 months", tone: "none" },
    ]);
  });

  it("says a pinned package's snapshot and an old promise's constraint", () => {
    expect(
      answerText(
        answer({ verdict: "pinned", signals: [makeSignal({ id: "S6", data: { version: "dev-master" } })] }),
      ),
    ).toBe("Pinned to dev-master, a branch snapshot rather than a release. You require it directly.");
    expect(
      answerText(
        answer({
          verdict: "old-promise",
          signals: [
            makeSignal({
              id: "S5",
              data: {
                released: "2014-01-05T00:00:00Z",
                written_for_php: 5,
                php_constraint: ">=5.3.0",
                target_php: "8.4",
              },
            }),
          ],
        }),
      ),
    ).toBe(
      "An old promise: released in 2014 for PHP 5, its open constraint >=5.3.0 admits PHP 8.4 untested. You require it directly.",
    );
  });

  it("falls back to fewer words when the signal a clause would quote is missing", () => {
    expect(answerText(answer({ verdict: "left-behind" }))).toBe(
      "Left behind on an older branch while a newer one kept releasing. You require it directly.",
    );
    expect(answerText(answer({ verdict: "abandoned", direct: false, chain: [] }))).toBe(
      "Abandoned. Nothing you require directly reaches it.",
    );
    expect(answerText(answer({ verdict: "stale" }))).toBe("Stale. You require it directly.");
  });

  it("uses the host's own name for a host it does not know, and never reads an inherited key", () => {
    const parts = answer({
      verdict: "abandoned",
      signals: [makeSignal({ id: "S3", data: { host: "constructor" } })],
    });
    expect(answerText(parts)).toBe("Archived on constructor. You require it directly.");
  });
});

describe("yearsPhrase", () => {
  it("says months under a year, never zero, and tenths of a year above it", () => {
    expect(yearsPhrase(0)).toBe("1 month");
    expect(yearsPhrase(0.5)).toBe("6 months");
    expect(yearsPhrase(3.64)).toBe("3.6 years");
  });
});

describe("pulledIn", () => {
  it("counts three or more of one vendor sharing a verdict and lists the rest one by one", () => {
    // Arrange
    const packages = [
      ...["compiler", "event", "math"].map((n) => ({ package: `hoa/${n}`, verdict: "abandoned" })),
      { package: "hoa/ruler", verdict: "pinned" },
      { package: "other/one", verdict: "silent" },
    ];
    const finding = makeFinding({ signals: [makeSignal({ id: "S7", data: { flagged: 5, packages } })] });

    // Act
    const pulled = pulledIn(finding);

    // Assert
    expect(pulled).toEqual({
      flagged: 5,
      entries: [
        { vendor: "hoa/*", packages: ["hoa/compiler", "hoa/event", "hoa/math"], verdict: "abandoned" },
        { vendor: null, packages: ["hoa/ruler"], verdict: "pinned" },
        { vendor: null, packages: ["other/one"], verdict: "silent" },
      ],
    });
  });

  it("is null with no S7, and skips malformed entries", () => {
    expect(pulledIn(makeFinding())).toBeNull();
    const finding = makeFinding({
      signals: [
        makeSignal({ id: "S7", data: { packages: [null, 3, { verdict: "x" }, { package: "a/b" }] } }),
      ],
    });
    expect(pulledIn(finding)).toEqual({
      flagged: 1,
      entries: [{ vendor: null, packages: ["a/b"], verdict: "flagged" }],
    });
  });
});

describe("pulledVerdicts", () => {
  it("counts every package by verdict, worst verdict first (S7's own order), not most first", () => {
    const packages = [
      { package: "a/one", verdict: "silent" },
      { package: "b/one", verdict: "stale" },
      ...["x", "y", "z"].map((n) => ({ package: `hoa/${n}`, verdict: "abandoned" })),
      { package: "c/one", verdict: "stale" },
    ];
    const pulled = pulledIn(makeFinding({ signals: [makeSignal({ id: "S7", data: { packages } })] }));
    expect(pulled && pulledVerdicts(pulled)).toEqual([
      { verdict: "abandoned", packages: ["hoa/x", "hoa/y", "hoa/z"] },
      { verdict: "silent", packages: ["a/one"] },
      { verdict: "stale", packages: ["b/one", "c/one"] },
    ]);
  });

  it("puts a verdict VERDICT_ORDER does not list last, whatever its count", () => {
    const packages = [
      ...["x", "y", "z"].map((n) => ({ package: `odd/${n}`, verdict: "mystery" })),
      { package: "a/one", verdict: "stale" },
    ];
    const pulled = pulledIn(makeFinding({ signals: [makeSignal({ id: "S7", data: { packages } })] }));
    expect(pulled && pulledVerdicts(pulled).map((group) => group.verdict)).toEqual(["stale", "mystery"]);
  });
});

describe("ageFact", () => {
  it("is the row's own age, S8 before S2 before S4, context only for abandoned", () => {
    const finding = makeFinding({
      verdict: "abandoned",
      signals: [makeSignal({ id: "S2", data: { years: 4 } }), makeSignal({ id: "S4", data: { years: 2 } })],
    });
    expect(ageFact(finding, THRESHOLDS)).toEqual({
      kind: "release",
      years: 4,
      warn: 3,
      high: 5,
      contextOnly: true,
    });
    expect(ageFact(makeFinding(), THRESHOLDS)).toBeNull();
  });
});
