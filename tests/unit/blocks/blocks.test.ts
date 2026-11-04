import { describe, expect, test } from "vitest";

import type { Finding } from "../../../src/model/report";
import { differencesFromModel, listedDifferences } from "../words/modelDifferences";
import { modelCases, recordedCases } from "../words/recorded";
import { BLOCK_KEYS, blockGolden, type BlockKey } from "./blockGoldens";

describe("each block equals the model's golden from the model's own inputs (SPEC §7.9.14)", () => {
  // The pinned model's block text lags its own inputs in these blocks.
  // List a block until the model renders it, then empty the list at the repin.
  // R12-22 (pending MODEL r12k): the deciding advisory reads its CVE id and its source id, which
  // carries the link; the model's golden reads the CVE id alone.
  const MODEL_LAGS: Readonly<Record<string, readonly BlockKey[]>> = {
    A: ["verdict_line"],
    "A-baselined-dagger": ["verdict_line"],
    "A-blocked-dagger": ["verdict_line"],
    "A-both-sections-dagger": ["verdict_line"],
    "A-gate-critical": ["verdict_line"],
    "A-gate-vulnerable": ["verdict_line"],
    "A-php-lowest-excluded-dagger": ["verdict_line"],
    "A-php-star-dagger": ["verdict_line"],
    "A-php-unsatisfiable-dagger": ["verdict_line"],
    B: ["readings"],
    "B-accepted-dagger": ["verdict_line"],
    "B-accepted-unread-dagger": ["verdict_line"],
    "B-also-dagger": ["readings"],
    "B-baselined-dagger": ["readings"],
    "B-dev-dagger": ["readings"],
    "B-gate-flag": ["readings"],
    "B-gate-list": ["readings"],
    "B-gate-none": ["readings"],
    E: ["verdict_line"],
    "E-dev-dagger": ["verdict_line"],
    "E-ignored-dagger": ["verdict_line"],
    "E-ignored-whole-dagger": ["verdict_line"],
    F: ["verdict_line"],
    "S10-lock-undated-dagger": ["readings"],
    "S5-parent-after-ga-dagger": ["readings"],
    "S5-star-dagger": ["readings"],
    "S5-untrusted-dagger": ["readings"],
    "S8-prerelease-installed-dagger": ["readings"],
    "adds-capped-update": ["verdict_line"],
    "affected-range-unknown-dagger": ["verdict_line"],
    "capped-local-dagger": ["verdict_line"],
    "either-critical-dagger": ["readings"],
    "either-low-dev-dagger": ["readings"],
    "fail-on-config-dagger": ["readings"],
    "fail-on-default-dagger": ["readings"],
    "feeds-drupal-dagger": ["verdict_line"],
    "fix-newest-held-dagger": ["verdict_line"],
    flysystem: ["readings"],
    guzzle: ["readings"],
    "guzzle-5": ["readings"],
    "guzzle-mixed": ["readings"],
    "joomla-filter": ["verdict_line"],
    "local-path-advisory": ["readings"],
    "long-range-dagger": ["verdict_line"],
    "mc-baseline-refused-dagger": ["verdict_line"],
    "mc-blocking-off-both-dagger": ["verdict_line"],
    "mc-blocking-off-dagger": ["verdict_line"],
    "mc-canonical-package-dagger": ["verdict_line"],
    "mc-canonical-vcs-dagger": ["verdict_line"],
    "mc-canonical-vcs-unmatched-dagger": ["verdict_line"],
    "mc-composite-dagger": ["verdict_line"],
    "mc-dev-update-dagger": ["verdict_line"],
    "mc-filter-only-dagger": ["verdict_line"],
    "mc-gets-below-dagger": ["verdict_line"],
    "mc-gets-next-form-dagger": ["verdict_line"],
    "mc-inline-dagger": ["verdict_line"],
    "mc-joint-dagger": ["verdict_line"],
    "mc-joint-down-dagger": ["verdict_line"],
    "mc-joint-retag-dagger": ["verdict_line"],
    "mc-link-newest-dagger": ["verdict_line"],
    "mc-lookup-incomplete-dagger": ["verdict_line"],
    "mc-lookup-kept-dagger": ["verdict_line"],
    "mc-minimal-changes-dagger": ["verdict_line"],
    "mc-newest-above-row-dagger": ["verdict_line"],
    "mc-package-hold-dagger": ["verdict_line"],
    "mc-pass-cap-dagger": ["verdict_line"],
    "mc-php-newest-dagger": ["verdict_line"],
    "mc-raise-php-dagger": ["verdict_line"],
    "mc-replan-major-dagger": ["verdict_line"],
    "mc-root-hold-dagger": ["verdict_line"],
    "mc-root-version-dagger": ["verdict_line"],
    "mc-split-both-refused-dagger": ["verdict_line"],
    "mc-split-dagger": ["verdict_line"],
    "mc-split-maintenance-larger-dagger": ["readings"],
    "mc-split-not-checked-dagger": ["verdict_line"],
    "mc-update-now-reduced-dagger": ["verdict_line"],
    "mc-update-now-refused-dagger": ["verdict_line"],
    "mc-with-all-dagger": ["verdict_line"],
    "mc-with-deps-dagger": ["verdict_line"],
    "move-check-dagger": ["verdict_line"],
    "partial-op-dagger": ["readings"],
    "platform-step-why-not-dagger": ["verdict_line"],
    "policy-audit-ignore-dagger": ["verdict_line"],
    "policy-off-dagger": ["verdict_line"],
    psr7: ["readings"],
    routing: ["readings"],
    "routing-self-dagger": ["readings"],
    "tie-dagger": ["readings"],
    "twig-1": ["verdict_line"],
    "twig-dev-dagger": ["verdict_line"],
    "unknown-vuln-dagger": ["verdict_line"],
    "unrated-dagger": ["verdict_line"],
    xmlseclibs: ["verdict_line"],
    "yaml-3.4": ["readings"],
  };
  const compared = (name: string): readonly BlockKey[] =>
    BLOCK_KEYS.filter((key) => !(MODEL_LAGS[name] ?? []).includes(key));

  test.each(modelCases())("$name", ({ name, finding, run, metadata, golden }) => {
    const page = Object.fromEntries(
      compared(name).map((key) => [key, blockGolden(key, finding, run, metadata)]),
    );
    const model = Object.fromEntries(compared(name).map((key) => [key, golden[key]]));

    expect(page).toEqual(model);
  });

  test("the pinned model still lags in each listed block; empty the list at the repin", () => {
    const cases = new Map(modelCases().map((c) => [c.name, c]));
    const caught = Object.entries(MODEL_LAGS).flatMap(([name, keys]) => {
      const c = cases.get(name);
      const lags = (key: BlockKey): boolean =>
        c !== undefined &&
        JSON.stringify(blockGolden(key, c.finding, c.run, c.metadata)) !== JSON.stringify(c.golden[key]);
      return keys.filter((key) => !lags(key)).map((key) => `${name}: ${key}`);
    });

    expect(caught).toEqual([]);
  });
});

describe("on lockrot's recording a block differs from the model's golden only where the list says so", () => {
  test.each(BLOCK_KEYS)("%s", (key) => {
    const differing = differencesFromModel(key, ({ finding, run, metadata }) =>
      blockGolden(key, finding, run, metadata),
    );

    expect(differing.map(({ name }) => name).sort()).toEqual([...listedDifferences(key).keys()].sort());
  });
});

/** The recorded moves without the why-not step that lockrot ends an unresolved move with, where the
 *  model left `version` null and so wrote no such step (SPEC §5.6). */
function withoutVersionStep(recorded: Finding, model: Finding): Finding {
  type AnyMove = NonNullable<Finding["next_step"]> | NonNullable<Finding["next_step"]>["also"][number];
  const modelMoves: (AnyMove | undefined)[] = model.next_step
    ? [model.next_step, ...model.next_step.also]
    : [];
  const strip = <M extends AnyMove>(move: M, at: number): M =>
    move.check?.result !== "resolves" &&
    move.version !== null &&
    modelMoves[at]?.version === null &&
    move.commands.at(-1)?.[1] === "why-not"
      ? { ...move, commands: move.commands.slice(0, -1) }
      : move;
  const lead = recorded.next_step;
  return lead === null
    ? recorded
    : { ...recorded, next_step: { ...strip(lead, 0), also: lead.also.map((m, i) => strip(m, i + 1)) } };
}

describe("a MOVE_VERSION difference is only the why-not step of a move that does not resolve", () => {
  const listed = [...listedDifferences("moves")]
    .filter(([, reason]) => reason.includes("MOVE_VERSION"))
    .map(([name]) => name);
  const models = new Map(modelCases().map((model) => [model.name, model]));

  test("the list names such cases", () => {
    expect(listed.length).toBeGreaterThan(0);
  });

  test.each(recordedCases().filter(({ name }) => listed.includes(name)))(
    "$name",
    ({ name, finding, run, metadata }) => {
      const model = models.get(name);
      if (model === undefined) throw new Error(`no model case ${name}`);

      expect(blockGolden("moves", withoutVersionStep(finding, model.finding), run, metadata)).toEqual(
        model.golden.moves,
      );
    },
  );
});

describe("the cases the block goldens are written from", () => {
  const findings = recordedCases().map(({ finding }) => finding);

  test("hold every move kind of SPEC §7.9.13.4", () => {
    const kinds = new Set(findings.flatMap((f) => f.next_step?.kind ?? []));

    expect([...kinds].sort()).toEqual(
      [
        "blocked",
        "find-alternative",
        "no-fix",
        "no-move",
        "no-single-fix",
        "no-tag",
        "raise-php",
        "replace",
        "require",
        "tag",
        "test",
        "update",
      ].sort(),
    );
  });

  test("hold every opening and every score-0 word", () => {
    const openings = new Set(findings.flatMap((f) => ("decided_by" in f.score ? f.score.decided_by : [])));
    const zero = new Set(findings.flatMap((f) => ("decided_by" in f.score ? [] : f.verdict)));

    expect([...openings].sort()).toEqual(["combination", "either", "maintenance", "security"]);
    expect([...zero].sort()).toEqual(["finished", "ok", "unknown"]);
  });
});
