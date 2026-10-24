// The G-I fixes of the move card, its Held by and the ladder, each pinned on the shape of the real
// lock that showed it.
import { describe, expect, test } from "vitest";

import { checkLine, holderName, moveCards } from "../../../src/domain/moveCards";
import { plain } from "../../../src/domain/rich";
import { securityRungs } from "../../../src/domain/securityBlock";
import type { Finding, HeldBy, RepositoryMetadata, Run } from "../../../src/model/report";
import { modelCases } from "../words/recorded";

function modelCase(name: string): { finding: Finding; run: Run; metadata: RepositoryMetadata | null } {
  const found = modelCases().find((c) => c.name === name);
  if (found === undefined) throw new Error(`no case ${name}`);
  return structuredClone({ finding: found.finding, run: found.run, metadata: found.metadata });
}

const root = (target: string | null, constraint: string, link: HeldBy["link"] = "root-require"): HeldBy => ({
  source: "root",
  package: null,
  version: null,
  link,
  target,
  constraint,
  holder: null,
});

function heldCase(held: HeldBy[]): { finding: Finding; run: Run } {
  const { finding, run } = modelCase("holder-vuln-dagger");
  if (finding.next_step === null) throw new Error("holder-vuln‡ has a move");
  finding.next_step.held_by = held;
  return { finding, run };
}

describe("R1, G138: a ladder rung's holders", () => {
  test("names each holder once, in first-seen order (monica's symfony/http-foundation)", () => {
    const { finding, metadata } = modelCase("B");
    const row = [...(metadata?.branches ?? [])].reverse().find((r) => r.fixes !== null && r.fixes.fixed > 0);
    if (row?.fixes == null) throw new Error("B has a ladder rung");
    if (finding.next_step !== null) finding.next_step.held_by = [];
    row.fixes.held_by = [
      root("symfony/http-foundation", "^5.4"),
      root("symfony/http-kernel", "^5.4"),
      root("symfony/mime", "^5.4"),
      {
        source: "package",
        package: "fruitcake/php-cors",
        version: "v1.3.0",
        link: "require",
        target: "symfony/http-foundation",
        constraint: "^4|^5|^6|^7",
        holder: null,
      },
    ];

    const rung = securityRungs(finding, metadata).find((r) => r.branch === row.branch);

    expect(rung?.kind).toMatch(/ · held by composer\.json and fruitcake\/php-cors$/);
  });
});

describe("R2, G121: the Held by fold", () => {
  test("counts a root hold as in composer.json, beside the graded counts (wallabag 7.4's symfony/mailer)", () => {
    const graded = (pkg: string, verdict: string): HeldBy => ({
      source: "package",
      package: pkg,
      version: "v5.13.2",
      link: "require",
      target: "symfony/http-foundation",
      constraint: "^4.4|^5.0",
      holder: { verdict, flag_ids: ["left-behind"], next_step: null } as unknown as HeldBy["holder"],
    });
    const { finding, run } = heldCase([
      root(null, "^4.4.49", "require"),
      root("scheb/2fa-bundle", "^5.13.2"),
      root("symfony/http-foundation", "^4.4.49"),
      root("symfony/mime", "^4.4.47"),
      graded("scheb/2fa-bundle", "high"),
    ]);

    expect(moveCards(finding, run)[0]?.heldBy?.fold?.summary).toBe(
      "2 more: 1 in composer.json and 1 graded high",
    );
  });
});

describe("G121 and §7.9.13: holds by the release the move installs", () => {
  test("rank after the root and count apart from the graded holders (wallabag 7.4's symfony/mailer)", () => {
    const { finding, run } = modelCase("holder-vuln-dagger");
    const pkg = (
      name: string,
      version: string,
      target: string,
      constraint: string,
      verdict: string,
      flags: string[],
    ): HeldBy => ({
      source: "package",
      package: name,
      version,
      link: "require",
      target,
      constraint,
      holder: { verdict, flag_ids: flags, next_step: null } as unknown as HeldBy["holder"],
    });
    if (finding.next_step === null) throw new Error("holder-vuln‡ has a move");
    finding.next_step.held_by = [
      root(null, "^4.4.49", "require"),
      root("scheb/2fa-bundle", "^5.13.2"),
      root("symfony/http-foundation", "^4.4.49"),
      root("symfony/mime", "^4.4.47"),
      pkg("scheb/2fa-bundle", "v5.13.2", "symfony/http-foundation", "^4.4|^5.0", "high", ["left-behind"]),
      pkg("symfony/http-foundation", "v4.4.49", "symfony/mime", "^4.3|^5.0", "critical", [
        "left-behind",
        "vulnerable",
      ]),
      pkg(finding.package, "v5.4.52", "psr/event-dispatcher", "^1", "high", ["left-behind", "vulnerable"]),
      pkg(finding.package, "v5.4.52", "symfony/mime", "^5.2.6|^6.0", "high", ["left-behind", "vulnerable"]),
    ];

    const fold = moveCards(finding, run)[0]?.heldBy?.fold;

    expect(fold?.summary).toBe(
      "5 more: 1 in composer.json, 2 from the release this move installs, 1 graded critical and 1 graded high",
    );
    expect(fold?.holders.map(holderName)).toEqual([
      "your composer.json",
      `${finding.package} v5.4.52, the release this move installs`,
      `${finding.package} v5.4.52, the release this move installs`,
      "symfony/http-foundation v4.4.49",
      "scheb/2fa-bundle v5.13.2",
    ]);
  });
});

describe("S1, §7.9.21: the check line of a refused baseline", () => {
  const refused = (run: Partial<Run>): string => {
    const { finding } = modelCase("holder-vuln-dagger");
    const move = finding.next_step;
    if (move === null) throw new Error("holder-vuln‡ has a move");
    return plain(
      checkLine(
        { ...move, check: { result: "not_checked", reason: "baseline_refused" } } as typeof move,
        {
          move_check: {},
          ...run,
        } as Run,
      ) ?? [],
    );
  };
  const window = (inside: boolean) =>
    ({ target: { php: "8.2.99", inside } }) as unknown as NonNullable<Run["php_window"]>;

  test("points to the PHP line when the target lies outside the window", () => {
    expect(refused({ php_window: window(false) })).toBe(
      "if Composer resolves it (not checked: Composer's solver refuses the lock itself at the target PHP; see the PHP line in the Overview)",
    );
  });

  test("points to the Run tab when the target lies inside the window (mautic at 8.2)", () => {
    expect(refused({ php_window: window(true) })).toBe(
      "if Composer resolves it (not checked: Composer's solver refuses the lock itself; the Run tab names the cause)",
    );
  });

  test("points to the Run tab when the run has no window", () => {
    expect(refused({ php_window: null })).toBe(
      "if Composer resolves it (not checked: Composer's solver refuses the lock itself; the Run tab names the cause)",
    );
  });
});

describe("L3, G118: a hold by the release the move installs", () => {
  test("names that release, with its link words and no grade, flags or own step (wallabag 7.4's symfony/mailer)", () => {
    const { finding, run } = modelCase("holder-vuln-dagger");
    const own: HeldBy = {
      source: "package",
      package: finding.package,
      version: "v5.4.52",
      link: "require",
      target: "symfony/mime",
      constraint: "^5.2.6|^6.0",
      holder: {
        verdict: "high",
        flag_ids: ["left-behind", "vulnerable"],
        next_step: { kind: "require", constraint: "^5.4.52", to_branch: "5.x", check: null },
      } as unknown as HeldBy["holder"],
    };
    if (finding.next_step === null) throw new Error("holder-vuln‡ has a move");
    finding.next_step.held_by = [own];

    const shown = moveCards(finding, run)[0]?.heldBy?.shown[0];

    expect(shown === undefined ? null : holderName(shown)).toBe(
      `${finding.package} v5.4.52, the release this move installs`,
    );
    expect(shown?.grade).toBeNull();
    expect(plain(shown?.meta ?? [])).toBe("requires symfony/mime ^5.2.6|^6.0");
    expect(shown?.step).toBeNull();
  });
});

describe("L3 with no version", () => {
  test("names the release without a version", () => {
    const { finding, run } = modelCase("holder-vuln-dagger");
    if (finding.next_step === null) throw new Error("holder-vuln‡ has a move");
    finding.next_step.held_by = [
      {
        source: "package",
        package: finding.package,
        version: null,
        link: "require",
        target: "symfony/mime",
        constraint: "^6.0",
        holder: null,
      },
    ];

    const shown = moveCards(finding, run)[0]?.heldBy?.shown[0];

    expect(shown === undefined ? null : holderName(shown)).toBe(
      `${finding.package}, the release this move installs`,
    );
  });
});

describe("L5: the platform step of a move card", () => {
  const platformLine = (override: string | null, target: string): (string | null)[] => {
    const { finding, run } = modelCase("holder-vuln-dagger");
    const window = { ...(run.php_window ?? {}), platform_override: override } as NonNullable<
      Run["php_window"]
    >;
    return moveCards(finding, { ...run, target_php: target, php_window: window }).map((c) => c.platformStep);
  };

  test("asks to set config.platform.php first when it lies outside the target's minor (wallabag at 8.4)", () => {
    expect(platformLine("7.4.29", "8.4")[0]).toBe(
      "First set config.platform.php to your PHP 8.4 release: the lock records 7.4.29.",
    );
  });

  test("says nothing when config.platform.php lies inside the target's minor", () => {
    expect(platformLine("8.4.3", "8.4")[0]).toBeNull();
  });

  test("reads a major alone as its .0 minor", () => {
    expect(platformLine("8", "8.0")[0]).toBeNull();
  });

  test("prints on a Then card with commands and on no card without one", () => {
    const { finding, run } = modelCase("holder-vuln-dagger");
    const lead = finding.next_step;
    if (lead === null) throw new Error("holder-vuln‡ has a move");
    const then = { ...lead, commands: [["composer", "update", "acme/then"]] };
    finding.next_step = { ...lead, commands: [], also: [then] };
    const window = { ...(run.php_window ?? {}), platform_override: "7.4.29" } as NonNullable<
      Run["php_window"]
    >;

    const cards = moveCards(finding, { ...run, target_php: "8.4", php_window: window });

    expect(cards.map((c) => [c.heading, c.platformStep])).toEqual([
      ["The move", null],
      ["Then", "First set config.platform.php to your PHP 8.4 release: the lock records 7.4.29."],
    ]);
  });

  test("says nothing when the lock sets no config.platform.php", () => {
    expect(platformLine(null, "8.4")[0]).toBeNull();
  });
});
