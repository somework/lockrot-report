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

    const rung = securityRungs(finding, modelCase("B").run, metadata).find((r) => r.branch === row.branch);

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

describe("G121 and §7.9.13: holds by its own release", () => {
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
      "5 more: 1 in composer.json, 2 of its own releases, 1 graded critical and 1 graded high",
    );
    expect(fold?.holders.map(holderName)).toEqual([
      "your composer.json",
      `${finding.package} v5.4.52, its own release`,
      `${finding.package} v5.4.52, its own release`,
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

describe("OWN, G118: a hold by its own release", () => {
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
      `${finding.package} v5.4.52, its own release`,
    );
    expect(shown?.grade).toBeNull();
    expect(plain(shown?.meta ?? [])).toBe("requires symfony/mime ^5.2.6|^6.0");
    expect(shown?.step).toBeNull();
  });
});

describe("OWN with no version", () => {
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

    expect(shown === undefined ? null : holderName(shown)).toBe(`${finding.package}, its own release`);
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

const pkgHold = (
  name: string,
  target: string | null,
  constraint: string,
  holder: { verdict: string; flags: string[] } | null,
): HeldBy => ({
  source: "package",
  package: name,
  version: "1.0.0",
  link: "require",
  target,
  constraint,
  holder:
    holder === null
      ? null
      : ({ verdict: holder.verdict, flag_ids: holder.flags, next_step: null } as unknown as HeldBy["holder"]),
});

describe("RANK, §7.9.13: root, its own releases, holds on the package, then the rest", () => {
  test("puts a hold on the finding's package before a graded hold on another package (monica's firebase/php-jwt)", () => {
    const { finding, run } = heldCase([
      root("laravel/socialite", "^5.5"),
      root("socialiteproviders/facebook", "^4.1"),
      pkgHold("socialiteproviders/manager", "laravel/socialite", "^5.5", { verdict: "ok", flags: [] }),
      pkgHold("socialiteproviders/facebook", "socialiteproviders/manager", "~4.0", {
        verdict: "medium",
        flags: ["stale"],
      }),
      pkgHold("laravel/socialite", null, "^6.4", { verdict: "ok", flags: [] }),
    ]);

    const block = moveCards(finding, run)[0]?.heldBy;

    expect([...(block?.shown ?? []), ...(block?.fold?.holders ?? [])].map(holderName)).toEqual([
      "your composer.json",
      "your composer.json",
      "laravel/socialite 1.0.0",
      "socialiteproviders/facebook 1.0.0",
      "socialiteproviders/manager 1.0.0",
    ]);
  });

  test("orders one group by grade, then by name", () => {
    const { finding, run } = heldCase([
      pkgHold("b/ok", "x/y", "^1", { verdict: "ok", flags: [] }),
      pkgHold("c/high", "x/y", "^1", { verdict: "high", flags: ["stale"] }),
      pkgHold("a/high", "x/y", "^1", { verdict: "high", flags: ["stale"] }),
      pkgHold("a/ok", "x/y", "^1", { verdict: "ok", flags: [] }),
      pkgHold("d/none", "x/y", "^1", null),
    ]);

    const block = moveCards(finding, run)[0]?.heldBy;

    expect([...(block?.shown ?? []), ...(block?.fold?.holders ?? [])].map((h) => h.name)).toEqual([
      "a/high",
      "c/high",
      "a/ok",
      "b/ok",
      "d/none",
    ]);
  });
});

describe("REQ-DEV: a root hold on require-dev", () => {
  test("adds (require-dev) to its link words (wallabag 7.4's symfony/var-dumper)", () => {
    const { finding, run } = heldCase([root(null, "^4.4.47", "require-dev")]);

    expect(plain(moveCards(finding, run)[0]?.heldBy?.shown[0]?.meta ?? [])).toBe(
      "requires ^4.4.47 (require-dev)",
    );
  });
});

describe("W6: a hold whose holder is null", () => {
  test("prints with no grade and no flags (wallabag 7.4's twig/twig v3.28.0)", () => {
    const { finding, run } = heldCase([pkgHold("twig/twig", "symfony/twig-bridge", "^3.0", null)]);

    const shown = moveCards(finding, run)[0]?.heldBy?.shown[0];

    expect(shown?.grade).toBeNull();
    expect(plain(shown?.meta ?? [])).toBe("requires symfony/twig-bridge ^3.0");
  });
});

describe("the ladder rung's holders", () => {
  function rungWith(held: HeldBy[], moveHeld: HeldBy[]): string | undefined {
    const { finding, metadata } = modelCase("B");
    const row = [...(metadata?.branches ?? [])].reverse().find((r) => r.fixes !== null && r.fixes.fixed > 0);
    if (row?.fixes == null || finding.next_step === null) throw new Error("B has a ladder rung and a move");
    finding.next_step.held_by = moveHeld;
    row.fixes.held_by = held;
    return securityRungs(finding, modelCase("B").run, metadata).find((r) => r.branch === row.branch)?.kind;
  }

  test("OWN: names its own release, never the package (wallabag 7.4's symfony/google-mailer)", () => {
    const { finding } = modelCase("B");
    expect(
      rungWith([root(null, "^4.4"), pkgHold(finding.package, "psr/event-dispatcher", "^1", null)], []),
    ).toMatch(/ · held by composer\.json and its own release$/);
  });

  test("W8: says every holder in Held by when it holds them all", () => {
    const held = [root("a/one", "^1"), pkgHold("b/two", "x/y", "^1", null)];
    expect(rungWith(held, held)).toMatch(/ · held by every holder in Held by$/);
  });
});

describe("W3: the platform line on a run whose baseline Composer refuses", () => {
  const line = (inside: boolean, baseline: string): string | null => {
    const { finding, run } = modelCase("holder-vuln-dagger");
    const window = {
      ...(run.php_window ?? {}),
      platform_override: "7.4.29",
      target: { php: "8.4.99", inside },
    } as NonNullable<Run["php_window"]>;
    const moveCheck = { ...(run.move_check ?? {}), baseline } as NonNullable<Run["move_check"]>;
    return (
      moveCards(finding, { ...run, target_php: "8.4", php_window: window, move_check: moveCheck })[0]
        ?.platformStep ?? null
    );
  };

  test("adds that the PHP line names the packages when the target lies outside the window (wallabag at 8.4)", () => {
    expect(line(false, "refused")).toBe(
      "First set config.platform.php to your PHP 8.4 release: the lock records 7.4.29. Composer still refuses the lock itself: the PHP line names the packages.",
    );
  });

  test("adds that the Run tab names the cause when the target lies inside the window", () => {
    expect(line(true, "refused")).toBe(
      "First set config.platform.php to your PHP 8.4 release: the lock records 7.4.29. Composer still refuses the lock itself: the Run tab names the cause.",
    );
  });

  test("adds nothing when Composer resolves the baseline", () => {
    expect(line(false, "resolves")).toBe(
      "First set config.platform.php to your PHP 8.4 release: the lock records 7.4.29.",
    );
  });
});

describe("M7: a why-not check on a held move", () => {
  const note = (commands: string[][], because: string[]): string | null => {
    const { finding, run } = modelCase("holder-vuln-dagger");
    if (finding.next_step === null) throw new Error("holder-vuln‡ has a move");
    finding.next_step = {
      ...finding.next_step,
      commands,
      composer_moves_because: because,
    } as typeof finding.next_step;
    return moveCards(finding, run)[0]?.checkNote ?? null;
  };

  test("says what the check shows (monica's erusev/parsedown)", () => {
    expect(note([["composer", "why-not", "knuckleswtf/scribe", "5.11.0"]], ["holders"])).toBe(
      "This shows which package holds the move.",
    );
  });

  test("says it when the why-not shares the box with another command", () => {
    expect(
      note(
        [
          ["composer", "require", "acme/x:^2"],
          ["composer", "why-not", "acme/y", "1.0"],
        ],
        ["holders"],
      ),
    ).toBe("This shows which package holds the move.");
  });

  test("says nothing when the box shows the refusal instead of the commands", () => {
    expect(
      note(
        [
          ["composer", "why-not", "acme/y", "1.0"],
          ["composer", "exec", "calc"],
        ],
        ["holders"],
      ),
    ).toBeNull();
  });

  test("says nothing without a why-not, or when no holder is the reason", () => {
    expect(note([["composer", "require", "acme/x:^2"]], ["holders"])).toBeNull();
    expect(note([["composer", "why-not", "acme/y", "1.0"]], ["transitive"])).toBeNull();
  });
});
